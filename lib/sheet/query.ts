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
        businessUnit: { select: { code: true, name: true } },
        responsibleUser: { select: { name: true } },
      },
      // The order an Objective's own Control Items print in, which is also the
      // order that decides which of them carries the statement.
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
      // Carried so the entry grid can hand a formula back as it was written,
      // rather than as the number it last evaluated to.
      formula: entry.formula,
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

  /**
   * Every node that belongs on this sheet: those at the requested levels, plus
   * the ancestors that place them. A Level 4 node also has to belong to the
   * requested org units, or a division sheet would show its neighbours.
   */
  const inScope = new Set<string>();
  for (const node of nodes) {
    if (!options.levels.includes(node.level)) continue;
    if (options.orgUnitIds && node.orgUnitId && !options.orgUnitIds.includes(node.orgUnitId)) {
      continue;
    }
    inScope.add(node.id);
    for (const ancestorId of ancestors(node.id)) inScope.add(ancestorId);
  }

  function emitGroup(node: (typeof nodes)[number]): void {
    if (groupById.has(node.id)) return;
    const isGoal = node.kind === "GOAL" && node.level === 1;
    const group: GroupRow = {
      id: node.id,
      kind: node.kind === "GOAL" ? "GOAL" : "OBJECTIVE",
      level: node.level,
      statement: node.statement,
      ordinal: isGoal ? ++goalOrdinal : null,
      path: ancestors(node.id),
      controlItemIds: [],
      laddersTo:
        node.kind === "OBJECTIVE" && !options.levels.includes(node.level - 1)
          ? ladderTarget(node.id)
          : null,
      orgUnitId: node.orgUnitId ?? null,
    };
    groupById.set(node.id, group);
    rows.push(group as SheetRowModel);
  }

  /** Objectives with something deployed from them, so they need a header. */
  const hasDeployment = new Set<string>();
  for (const node of nodes) {
    if (node.parentId && inScope.has(node.id)) hasDeployment.add(node.parentId);
  }

  /*
   * Walk the tree in structural order so groups nest correctly.
   *
   * An Objective with Control Items and nothing deployed from it emits no row
   * of its own: its statement is printed on the first of them, which also
   * carries that item's figures. One Control Item therefore reads as a single
   * row with the statement and the numbers together, which is what the sheet
   * is for.
   *
   * An Objective that *is* deployed from needs a header for what hangs beneath
   * it, so it emits its group row and its own Control Items sit under it like
   * any other child - printing what each measures rather than repeating the
   * statement, which is already above them.
   *
   * An Objective with nothing under it at all *does* emit a row, blank across
   * every column. That is a real hole in the deployment and hiding it would be
   * the one thing worse than showing it - and it is also how a structure gets
   * built from nothing, since you cannot add a measure to a row you cannot
   * see.
   */
  const ordered = [...nodes].sort(compareNodes(nodeById));
  for (const node of ordered) {
    if (!inScope.has(node.id)) continue;

    const items = itemsByNode.get(node.id);
    if (!items?.length) {
      emitGroup(node);
      continue;
    }
    const carriesHeader = hasDeployment.has(node.id);
    const path = ancestors(node.id);
    for (const ancestor of path) {
      const ancestorNode = nodeById.get(ancestor);
      if (ancestorNode && inScope.has(ancestor)) emitGroup(ancestorNode);
    }
    if (carriesHeader) emitGroup(node);

    for (const [index, item] of items.entries()) {
      // The statement is on the header when there is one, so no Control Item
      // repeats it.
      const firstOfObjective = !carriesHeader && index === 0;
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
        // The row's name is its Objective's statement, on every one of the
        // Objective's Control Items. `firstOfObjective` is what the sheet uses
        // to print it once; everywhere else - the reminder, /my-entries, the
        // review - a row still knows what it is called without a second
        // lookup.
        name: node.statement,
        objectiveId: node.id,
        firstOfObjective,
        objectiveItemCount: items.length,
        measuredAs: item.measuredAs ?? defaultMeasuredAs(item.unit),
        measuredAsRaw: item.measuredAs,
        unit: item.unit,
        decimalPlaces: item.decimalPlaces,
        direction: item.direction,
        aggregation: item.aggregation,
        dicCode: item.dicOrgUnit.code,
        dicName: item.dicOrgUnit.name,
        dicOrgUnitId: item.dicOrgUnitId,
        businessUnitCode: item.businessUnit.code,
        businessUnitName: item.businessUnit.name,
        businessUnitId: item.businessUnitId,
        responsibleUserId: item.responsibleUserId,
        responsibleUserName: item.responsibleUser?.name ?? null,
        level: node.level,
        path: carriesHeader ? [...path, node.id] : path,
        laddersTo: options.levels.includes(4) ? ladderTarget(node.id) : null,
        cells: built.cells,
        kiSymbol: built.kiCell.symbol,
      };
      rows.push(row as SheetRowModel);

      for (const groupId of carriesHeader ? [...path, node.id] : path) {
        groupById.get(groupId)?.controlItemIds.push(item.id);
      }
    }
  }

  // Every division and department, not merely those already carrying a
  // Control Item - a new measure has to be assignable to one that has none
  // yet, and a department leader needs to see their own division listed even
  // before they have added their first Level 4 branch to it.
  const orgUnitRows = await prisma.orgUnit.findMany({
    where: { type: { in: ["DIVISION", "DEPARTMENT"] } },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    select: { id: true, code: true, name: true, type: true, parentId: true },
  });
  const businessUnitRows = await prisma.businessUnit.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true },
  });
  const orgUnitCodeById = new Map(orgUnitRows.map((unit) => [unit.id, unit.code]));

  return {
    kiCode: ki.code,
    kiId: ki.id,
    kiStartYear,
    months,
    versions,
    bands,
    rows,
    dics: orgUnitRows.map((unit) => ({
      id: unit.id,
      code: unit.code,
      name: unit.name,
      type: unit.type as "DIVISION" | "DEPARTMENT",
      parentCode:
        unit.type === "DEPARTMENT" && unit.parentId ? orgUnitCodeById.get(unit.parentId) ?? null : null,
    })),
    businessUnits: businessUnitRows,
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

/**
 * Depth-first structural order: a node follows its parent and its earlier
 * siblings, with a department's branches ahead of the company's own breakdown.
 *
 * An Objective's children are not all the same level. It can carry Level 3
 * Objectives continuing the company tree *and* Level 4 department branches
 * laddering into it, side by side. Ordering those purely by `sort_order`
 * interleaves them, and a branch somebody has just added lands wherever its
 * number happens to fall - which on a real plan meant several rows down, past
 * a Level 3 Objective and all of its measures.
 *
 * So siblings group by level before order, deepest first, and a branch sits
 * directly beneath the Objective it ladders onto. That is the row somebody was
 * looking at when they added it, and it is where they look for it afterwards.
 * Within one level nothing changes: `sort_order` still decides, which is what
 * `reorderWithinLevel` writes and what dragging a row means.
 */
function compareNodes(
  nodeById: Map<string, { id: string; parentId: string | null; level: number; sortOrder: number }>,
) {
  function sortPath(nodeId: string): number[] {
    const path: number[] = [];
    let current = nodeById.get(nodeId);
    while (current) {
      // Two keys per step. The level is negated so that the deeper of two
      // siblings sorts first, which is what puts a Level 4 branch above the
      // Level 3 deployment beside it.
      path.unshift(current.sortOrder);
      path.unshift(-current.level);
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
      // A shorter path is an ancestor and comes first. The sentinel has to
      // beat every real key, and the level keys are negative, so -1 would be
      // a Level 1 Goal rather than "nothing here".
      const left = pathA[i] ?? -Infinity;
      const right = pathB[i] ?? -Infinity;
      if (left !== right) return left - right;
    }
    return 0;
  };
}
