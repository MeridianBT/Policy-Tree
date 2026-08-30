/**
 * The formula engine's database-facing half: saving a formula, maintaining the
 * dependency graph, and recomputing dependents in topological order.
 *
 * Everything above this file (tokenise, parse, evaluate, graph) is pure and has
 * its own tests. This file is the seam where those meet Prisma, and it is the
 * only place that knows a formula is stored at all.
 */

import { prisma } from "@/lib/db";
import { FormulaError } from "./errors";
import { parseFormula, referencesOf } from "./parse";
import { cellAddress, evaluate, resolveRefs, type CellContext, type CellResolver, type ResolvedRef } from "./evaluate";
import { findCycle, topologicalOrder } from "./graph";
import { dateToPeriod, periodToDate, type PeriodKey } from "@/lib/domain/period";

export interface SaveFormulaInput {
  controlItemId: string;
  period: PeriodKey;
  planVersionId: string;
  formula: string;
  userId: string;
}

export interface RecomputedCell {
  entryId: string;
  value: number | null;
  error: string | null;
}

export interface SaveFormulaResult {
  entryId: string;
  value: number | null;
  formula: string | null;
  error: string | null;
  recomputed: RecomputedCell[];
}

/**
 * Saves a formula cell: parses it, resolves its references to real cells,
 * rejects a cycle by name, stores the edges, caches the result, and recomputes
 * everything downstream.
 */
export async function saveFormula(input: SaveFormulaInput): Promise<SaveFormulaResult> {
  const ast = parseFormula(input.formula);

  const [controlItem, version] = await Promise.all([
    prisma.controlItem.findUniqueOrThrow({
      where: { id: input.controlItemId },
      select: { id: true, code: true, measure: { select: { node: { select: { kiId: true } } } } },
    }),
    prisma.planVersion.findUniqueOrThrow({ where: { id: input.planVersionId } }),
  ]);
  if (version.lockedAt) {
    throw new FormulaError("LOCKED", `${version.code} is locked. Its values are read-only.`);
  }

  const context: CellContext = {
    controlItemCode: controlItem.code,
    period: input.period,
    versionCode: version.code,
  };

  const names = await buildNameMap(version.kiId);
  const selfAddress = cellKey(controlItem.id, input.period, input.planVersionId);

  // A reference that cannot be resolved at all - an unknown Control Item code,
  // an unknown version, a backwards range - is a typed error stored against
  // the cell, not a thrown exception. The formula is kept as typed so the
  // author can see and fix it.
  let referenced: ResolvedRef[] = [];
  let value: number | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  try {
    for (const node of referencesOf(ast)) {
      if (node.type !== "Reference") continue;
      referenced.push(...resolveRefs(node.ref, context));
    }

    const lookup = await buildLookup(version.kiId, referenced);

    // --- cycle detection ------------------------------------------------
    // A cycle is a structural mistake rather than a cell-level error: it is
    // rejected outright so the sheet never holds one.
    const proposedDependencies = referenced.map((ref) => {
      const target = lookup.resolveIds(ref);
      return cellKey(target.controlItemId, ref.period, target.planVersionId);
    });

    const storedEdges = await loadDependencyEdges(version.kiId);
    const dependenciesOf = (key: string): string[] =>
      key === selfAddress ? proposedDependencies : storedEdges.dependencies.get(key) ?? [];

    const cycle = findCycle(selfAddress, dependenciesOf);
    if (cycle) {
      const named = cycle.map((key) => names.describe(key));
      throw new FormulaError(
        "CYCLE",
        `This formula creates a circular reference: ${named.join(" → ")}.`,
        named,
      );
    }

    value = evaluate(ast, context, await lookup.resolver());
  } catch (error) {
    if (!(error instanceof FormulaError)) throw error;
    // A cycle is never stored - it is refused, and the cell is left alone.
    if (error.code === "CYCLE") throw error;
    errorCode = error.code;
    errorMessage = error.message;
    // Nothing resolvable means nothing to record in the dependency graph.
    if (error.code === "REF") referenced = [];
  }

  const periodDate = periodToDate(input.period);
  const existing = await prisma.entry.findUnique({
    where: {
      controlItemId_period_planVersionId: {
        controlItemId: input.controlItemId,
        period: periodDate,
        planVersionId: input.planVersionId,
      },
    },
  });

  const entry = await prisma.entry.upsert({
    where: {
      controlItemId_period_planVersionId: {
        controlItemId: input.controlItemId,
        period: periodDate,
        planVersionId: input.planVersionId,
      },
    },
    update: {
      formula: input.formula,
      rawValue: null,
      computedValue: value,
      errorCode,
      errorMessage,
      updatedById: input.userId,
    },
    create: {
      controlItemId: input.controlItemId,
      period: periodDate,
      planVersionId: input.planVersionId,
      formula: input.formula,
      computedValue: value,
      errorCode,
      errorMessage,
      updatedById: input.userId,
    },
  });

  await prisma.entryAudit.create({
    data: {
      entryId: entry.id,
      oldValue: existing?.formula ? existing.computedValue : existing?.rawValue ?? null,
      newValue: value,
      oldFormula: existing?.formula ?? null,
      newFormula: input.formula,
      changedById: input.userId,
    },
  });

  // Replace this cell's edges wholesale: a formula's dependencies are exactly
  // what it references now.
  await prisma.entryDependency.deleteMany({ where: { dependentEntryId: entry.id } });
  const edges = referenced.flatMap((ref) => {
    const ids = names.idsFor(ref);
    return ids
      ? [
          {
            dependentEntryId: entry.id,
            targetControlItemId: ids.controlItemId,
            targetPeriod: periodToDate(ref.period),
            targetPlanVersionId: ids.planVersionId,
          },
        ]
      : [];
  });
  if (edges.length) {
    await prisma.entryDependency.createMany({ data: edges, skipDuplicates: true });
  }

  const recomputed = await recomputeDependents(entry.id);

  return {
    entryId: entry.id,
    value,
    formula: input.formula,
    error: errorMessage,
    recomputed,
  };
}

/**
 * Recompute every formula cell downstream of a changed entry, in dependency
 * order, so a chain of any depth settles in one pass without a page reload.
 */
export async function recomputeDependents(entryId: string): Promise<RecomputedCell[]> {
  const changed = await prisma.entry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      controlItemId: true,
      period: true,
      planVersionId: true,
      planVersion: { select: { kiId: true } },
    },
  });
  if (!changed) return [];

  const kiId = changed.planVersion.kiId;
  const edges = await loadDependencyEdges(kiId);
  const seed = cellKey(changed.controlItemId, dateToPeriod(changed.period), changed.planVersionId);

  const order = topologicalOrder([seed], (key) => edges.dependents.get(key) ?? []);
  if (order.length === 0) return [];

  const results: RecomputedCell[] = [];
  for (const key of order) {
    const entry = edges.entryByKey.get(key);
    if (!entry?.formula) continue;
    results.push(await recomputeOne(entry.id));
  }
  return results;
}

async function recomputeOne(entryId: string): Promise<RecomputedCell> {
  const entry = await prisma.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      id: true,
      formula: true,
      period: true,
      controlItem: { select: { id: true, code: true } },
      planVersion: { select: { id: true, code: true, kiId: true } },
    },
  });
  if (!entry.formula) return { entryId, value: null, error: null };

  const context: CellContext = {
    controlItemCode: entry.controlItem.code,
    period: dateToPeriod(entry.period),
    versionCode: entry.planVersion.code,
  };

  let value: number | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    const ast = parseFormula(entry.formula);
    const referenced: ResolvedRef[] = [];
    for (const node of referencesOf(ast)) {
      if (node.type === "Reference") referenced.push(...resolveRefs(node.ref, context));
    }
    const lookup = await buildLookup(entry.planVersion.kiId, referenced);
    value = evaluate(ast, context, await lookup.resolver());
  } catch (error) {
    if (!(error instanceof FormulaError)) throw error;
    errorCode = error.code;
    errorMessage = error.message;
  }

  await prisma.entry.update({
    where: { id: entryId },
    data: { computedValue: value, errorCode, errorMessage },
  });

  return { entryId, value, error: errorMessage };
}

// --------------------------------------------------------------------------
// Lookups
// --------------------------------------------------------------------------

function cellKey(controlItemId: string, period: PeriodKey, planVersionId: string): string {
  return `${controlItemId}|${period}|${planVersionId}`;
}

/**
 * Resolves the codes a formula uses into database ids, and reads the values of
 * the referenced cells in one query.
 *
 * A reference to a locked version simply reads that version's stored value:
 * the freeze is what makes an old forecast quotable from a live formula.
 */
async function buildLookup(kiId: string, referenced: ResolvedRef[]) {
  const codes = [...new Set(referenced.map((ref) => ref.controlItemCode))];
  const versionCodes = [...new Set(referenced.map((ref) => ref.versionCode))];

  const [controlItems, versions] = await Promise.all([
    codes.length
      ? prisma.controlItem.findMany({
          where: { code: { in: codes }, measure: { node: { kiId } } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
    versionCodes.length
      ? prisma.planVersion.findMany({
          where: { kiId, code: { in: versionCodes } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ]);

  const itemByCode = new Map(controlItems.map((item) => [item.code, item.id]));
  const versionByCode = new Map(versions.map((version) => [version.code, version.id]));
  function resolveIds(ref: ResolvedRef): { controlItemId: string; planVersionId: string } {
    const controlItemId = itemByCode.get(ref.controlItemCode);
    if (!controlItemId) {
      throw new FormulaError("REF", `No Control Item with code "${ref.controlItemCode}" in this Ki.`);
    }
    const planVersionId = versionByCode.get(ref.versionCode);
    if (!planVersionId) {
      throw new FormulaError("REF", `No plan version "${ref.versionCode}" in this Ki.`);
    }
    return { controlItemId, planVersionId };
  }

  return {
    resolveIds,
    async resolver(): Promise<CellResolver> {
      const targets = referenced.map((ref) => ({ ref, ids: resolveIds(ref) }));
      const entries = targets.length
        ? await prisma.entry.findMany({
            where: {
              OR: targets.map((target) => ({
                controlItemId: target.ids.controlItemId,
                period: periodToDate(target.ref.period),
                planVersionId: target.ids.planVersionId,
              })),
            },
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

      const byKey = new Map(
        entries.map((entry) => [
          cellKey(entry.controlItemId, dateToPeriod(entry.period), entry.planVersionId),
          entry,
        ]),
      );

      return {
        read(ref: ResolvedRef): number | null {
          const ids = resolveIds(ref);
          const entry = byKey.get(cellKey(ids.controlItemId, ref.period, ids.planVersionId));
          if (!entry) return null;
          if (entry.errorMessage) {
            throw new FormulaError(
              "REF",
              `${cellAddress(ref)} is itself in error: ${entry.errorMessage}`,
            );
          }
          const stored = entry.formula ? entry.computedValue : entry.rawValue;
          return stored === null || stored === undefined ? null : Number(stored);
        },
      };
    },
  };
}

/**
 * Every Control Item code and version code in the Ki, both directions.
 *
 * Cycle messages have to name cells the new formula never mentioned - the cell
 * being saved, and any cell in the middle of the chain - so this map covers the
 * whole Ki rather than just the references at hand.
 */
async function buildNameMap(kiId: string) {
  const [controlItems, versions] = await Promise.all([
    prisma.controlItem.findMany({
      where: { measure: { node: { kiId } } },
      select: { id: true, code: true },
    }),
    prisma.planVersion.findMany({ where: { kiId }, select: { id: true, code: true } }),
  ]);

  const idToItemCode = new Map(controlItems.map((item) => [item.id, item.code]));
  const idToVersionCode = new Map(versions.map((version) => [version.id, version.code]));
  const itemByCode = new Map(controlItems.map((item) => [item.code, item.id]));
  const versionByCode = new Map(versions.map((version) => [version.code, version.id]));

  return {
    /** Human-readable address for a cell key, used in cycle messages. */
    describe(key: string): string {
      const [controlItemId, period, planVersionId] = key.split("|");
      return cellAddress({
        controlItemCode: idToItemCode.get(controlItemId) ?? controlItemId,
        period,
        versionCode: idToVersionCode.get(planVersionId) ?? planVersionId,
      });
    },
    idsFor(ref: ResolvedRef): { controlItemId: string; planVersionId: string } | null {
      const controlItemId = itemByCode.get(ref.controlItemCode);
      const planVersionId = versionByCode.get(ref.versionCode);
      return controlItemId && planVersionId ? { controlItemId, planVersionId } : null;
    },
  };
}

/** The whole Ki's formula graph, both directions, in one query. */
async function loadDependencyEdges(kiId: string) {
  const rows = await prisma.entryDependency.findMany({
    where: { dependentEntry: { planVersion: { kiId } } },
    select: {
      targetControlItemId: true,
      targetPeriod: true,
      targetPlanVersionId: true,
      dependentEntry: {
        select: { id: true, controlItemId: true, period: true, planVersionId: true, formula: true },
      },
    },
  });

  const dependencies = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  const entryByKey = new Map<string, { id: string; formula: string | null }>();

  for (const row of rows) {
    const dependentKey = cellKey(
      row.dependentEntry.controlItemId,
      dateToPeriod(row.dependentEntry.period),
      row.dependentEntry.planVersionId,
    );
    const targetKey = cellKey(
      row.targetControlItemId,
      dateToPeriod(row.targetPeriod),
      row.targetPlanVersionId,
    );

    entryByKey.set(dependentKey, {
      id: row.dependentEntry.id,
      formula: row.dependentEntry.formula,
    });

    (dependencies.get(dependentKey) ?? dependencies.set(dependentKey, []).get(dependentKey)!).push(targetKey);
    (dependents.get(targetKey) ?? dependents.set(targetKey, []).get(targetKey)!).push(dependentKey);
  }

  return { dependencies, dependents, entryByKey };
}
