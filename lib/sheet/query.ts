/**
 * Loading a sheet. This is the only place Prisma rows are turned into the
 * calculation module's plain inputs; from here on nothing downstream knows the
 * database exists.
 *
 * The whole Ki is loaded in four queries rather than per row, because the sheet
 * is a single page and a per-row query would be several hundred round trips.
 */

import { prisma } from "@/lib/db";
import { buildRow } from "@/lib/calc/row";
import { validateBands } from "@/lib/calc/bands";
import type { EvaluationBandSpec, ValuesByVersion, VersionSpec } from "@/lib/calc/types";
import { dateToPeriod, kiMonths, kiStartYearOf } from "@/lib/domain/period";
import type { ControlItemRow, GroupRow, SheetModel, SheetRowModel } from "./types";

export interface LoadSheetOptions {
  kiId?: string;
  /** Levels to include. Company sheet is 1-3; a division sheet is 4. */
  levels: number[];
  /** Restrict to Control Items owned by these org units (division sheet). */
  orgUnitIds?: string[];
  /** Pin targets to one version instead of resolving the latest forecast. */
  targetVersionId?: string | null;
}

export async function loadCurrentKi() {
  const ki =
    (await prisma.ki.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.ki.findFirst({ orderBy: { startDate: "desc" } }));
  if (!ki) throw new Error("No Ki has been set up. Run the seed or use Admin › Ki setup.");
  return ki;
}

export async function loadBands(): Promise<EvaluationBandSpec[]> {
  const rows = await prisma.evaluationBand.findMany({ orderBy: { sortOrder: "asc" } });
  const bands: EvaluationBandSpec[] = rows.map((band) => ({
    symbol: band.symbol,
    label: band.label,
    minPct: band.minPct === null ? null : Number(band.minPct),
    maxPct: band.maxPct === null ? null : Number(band.maxPct),
    colorHex: band.colorHex,
    sortOrder: band.sortOrder,
  }));
  // A broken scale mis-evaluates every Control Item, so it is a hard failure.
  validateBands(bands);
  return bands;
}

export async function loadVersions(kiId: string): Promise<VersionSpec[]> {
  const rows = await prisma.planVersion.findMany({
    where: { kiId },
    orderBy: { sequence: "asc" },
  });
  return rows.map((version) => ({
    id: version.id,
    code: version.code,
    label: version.label,
    sequence: version.sequence,
    isActual: version.isActual,
    lockedAt: version.lockedAt ? version.lockedAt.toISOString() : null,
  }));
}

export async function loadSheet(options: LoadSheetOptions): Promise<SheetModel> {
  const ki = options.kiId
    ? await prisma.ki.findUniqueOrThrow({ where: { id: options.kiId } })
    : await loadCurrentKi();
  const kiStartYear = kiStartYearOf(dateToPeriod(ki.startDate));
  const months = kiMonths(kiStartYear);

  const [bands, versions, nodes, controlItems] = await Promise.all([
    loadBands(),
    loadVersions(ki.id),
    prisma.node.findMany({
      where: { kiId: ki.id },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.controlItem.findMany({
      where: {
        node: { kiId: ki.id, level: { in: options.levels } },
        ...(options.orgUnitIds ? { dicOrgUnitId: { in: options.orgUnitIds } } : {}),
      },
      include: {
        dicOrgUnit: { select: { code: true, name: true } },
        responsibleUser: { select: { name: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const controlItemIds = controlItems.map((item) => item.id);
  const entries = controlItemIds.length
    ? await prisma.entry.findMany({
        where: { controlItemId: { in: controlItemIds } },
        select: {
          controlItemId: true,
          period: true,
          planVersionId: true,
          rawValue: true,
          computedValue: true,
          formula: true,
          errorMessage: true,
        },
      })
    : [];

  // control item -> version -> period -> cell
  const valuesByItem = new Map<string, ValuesByVersion>();
  for (const entry of entries) {
    let byVersion = valuesByItem.get(entry.controlItemId);
    if (!byVersion) {
      byVersion = {};
      valuesByItem.set(entry.controlItemId, byVersion);
    }
    const periodValues = (byVersion[entry.planVersionId] ??= {});
    const stored = entry.formula ? entry.computedValue : entry.rawValue;
    periodValues[dateToPeriod(entry.period)] = {
      value: stored === null || stored === undefined ? null : Number(stored),
      error: entry.errorMessage ?? null,
    };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const itemsByNode = new Map<string, typeof controlItems>();
  for (const item of controlItems) {
    const list = itemsByNode.get(item.nodeId) ?? [];
    list.push(item);
    itemsByNode.set(item.nodeId, list);
  }

  /** Ancestor chain, outermost first, excluding the node itself. */
  function ancestors(nodeId: string): string[] {
    const chain: string[] = [];
    let current = nodeById.get(nodeId);
    while (current?.parentId) {
      chain.unshift(current.parentId);
      current = nodeById.get(current.parentId);
    }
    return chain;
  }

  /** Nearest ancestor objective outside the requested levels — the ladder. */
  function ladderTarget(nodeId: string): string | null {
    let current = nodeById.get(nodeId);
    while (current?.parentId) {
      const parent = nodeById.get(current.parentId);
      if (!parent) return null;
      if (parent.kind === "OBJECTIVE" && !options.levels.includes(parent.level)) {
        return parent.statement;
      }
      current = parent;
    }
    return null;
  }

  const rows: SheetRowModel[] = [];
  const groupById = new Map<string, GroupRow>();
  let goalOrdinal = 0;
  const themes: Array<{ id: string; statement: string }> = [];

  /** Emit a group header and everything above it, once, in tree order. */
  function emitGroupChain(nodeId: string): void {
    for (const ancestorId of [...ancestors(nodeId), nodeId]) {
      if (groupById.has(ancestorId)) continue;
      const node = nodeById.get(ancestorId);
      if (!node) continue;
      const isGoal = node.kind === "GOAL" && node.level === 1;
      const group: GroupRow = {
        id: node.id,
        kind: node.kind === "GOAL" ? "GOAL" : node.kind === "THEME" ? "THEME" : "OBJECTIVE",
        level: node.level,
        statement: node.statement,
        ordinal: isGoal ? ++goalOrdinal : null,
        path: ancestors(node.id),
        controlItemIds: [],
        laddersTo:
          node.kind === "OBJECTIVE" && !options.levels.includes(node.level - 1)
            ? ladderTarget(node.id)
            : null,
      };
      groupById.set(node.id, group);
      rows.push(group as SheetRowModel);
      if (node.kind === "THEME") themes.push({ id: node.id, statement: node.statement });
    }
  }

  // Walk the tree in structural order so groups nest correctly.
  const ordered = [...nodes].sort(compareNodes(nodeById));
  for (const node of ordered) {
    const items = itemsByNode.get(node.id);
    if (!items?.length) continue;
    emitGroupChain(node.id);
    const path = [...ancestors(node.id), node.id];

    for (const item of items) {
      const built = buildRow({
        controlItem: {
          id: item.id,
          aggregation: item.aggregation,
          direction: item.direction,
          achievementMethod: item.achievementMethod,
          unit: item.unit,
          decimalPlaces: item.decimalPlaces,
        },
        kiStartYear,
        versions,
        valuesByVersion: valuesByItem.get(item.id) ?? {},
        bands,
        targetVersionId: options.targetVersionId ?? null,
      });

      const row: ControlItemRow = {
        id: item.id,
        kind: "CONTROL_ITEM",
        code: item.code,
        name: item.name,
        measuredAs: item.measuredAs ?? defaultMeasuredAs(item.unit),
        unit: item.unit,
        decimalPlaces: item.decimalPlaces,
        direction: item.direction,
        aggregation: item.aggregation,
        dicCode: item.dicOrgUnit.code,
        dicName: item.dicOrgUnit.name,
        responsibleUserName: item.responsibleUser?.name ?? null,
        level: node.level,
        path,
        laddersTo: options.levels.includes(4) ? ladderTarget(node.id) : null,
        cells: built.cells,
        kiSymbol: built.kiCell.symbol,
      };
      rows.push(row as SheetRowModel);

      for (const groupId of path) groupById.get(groupId)?.controlItemIds.push(item.id);
    }
  }

  const dicMap = new Map<string, string>();
  for (const item of controlItems) dicMap.set(item.dicOrgUnit.code, item.dicOrgUnit.name);

  return {
    kiCode: ki.code,
    kiId: ki.id,
    kiStartYear,
    months,
    versions,
    bands,
    rows,
    dics: [...dicMap.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code)),
    themes,
  };
}

/**
 * What to show in the "Control Item" column when nobody has filled it in. The
 * unit is the only thing the system knows, so it says that rather than leaving
 * the column blank.
 */
function defaultMeasuredAs(unit: string): string {
  switch (unit) {
    case "PERCENT": return "Percentage";
    case "CURRENCY": return "Currency";
    case "COUNT": return "Count";
    case "RATIO": return "Ratio";
    case "DAYS": return "Days";
    case "INDEX": return "Index";
    default: return "—";
  }
}

/** Depth-first structural order: a node follows its parent and its earlier siblings. */
function compareNodes(nodeById: Map<string, { id: string; parentId: string | null; sortOrder: number }>) {
  function sortPath(nodeId: string): number[] {
    const path: number[] = [];
    let current = nodeById.get(nodeId);
    while (current) {
      path.unshift(current.sortOrder);
      current = current.parentId ? nodeById.get(current.parentId) : undefined;
    }
    return path;
  }
  const cache = new Map<string, number[]>();
  const pathOf = (id: string) => {
    let path = cache.get(id);
    if (!path) {
      path = sortPath(id);
      cache.set(id, path);
    }
    return path;
  };
  return (a: { id: string }, b: { id: string }) => {
    const pathA = pathOf(a.id);
    const pathB = pathOf(b.id);
    for (let i = 0; i < Math.max(pathA.length, pathB.length); i++) {
      const left = pathA[i] ?? -1;
      const right = pathB[i] ?? -1;
      if (left !== right) return left - right;
    }
    return 0;
  };
}
