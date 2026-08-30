"use server";

/**
 * Uploading a workbook: what it would do, and then doing it.
 *
 * Two actions over one file. `previewImport` writes nothing; `applyImport`
 * takes the same file, plans it again from scratch and executes the result.
 * Re-planning rather than carrying a plan between the two clicks is
 * deliberate: there is no server-side session state to go stale, and what is
 * applied is what the second click's plan says - decided against the database
 * as it is at that moment, not as it was when somebody looked at a preview
 * five minutes ago.
 *
 * Nothing here writes to Prisma directly. Figures go through `saveEntry` and
 * structure through the same `addNode` / `addControlItem` the sheet uses, so
 * the upload is a faster way to do what the screens do and never a second way
 * in - the permission check, the flat refusal on a locked version, the audit
 * row and the formula recompute all still happen per cell.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole, requireSession } from "@/lib/auth/session";
import { activeKiId } from "@/lib/ki/active";
import { saveEntry } from "@/lib/entries/save";
import { addControlItem, addNode } from "@/lib/structure/actions";
import { dateToPeriod, kiMonths, kiStartYearOf, type PeriodKey } from "@/lib/domain/period";
import { readWorkbook, ImportReadError, type ReadProblem } from "./read";
import { buildImportPlan, describePlan, type ImportPlan, type Snapshot } from "./plan";

export interface ImportOutcome {
  ok: boolean;
  message: string;
  /** Absent when the file could not be read at all. */
  plan?: ImportPlan;
  problems?: ReadProblem[];
  skippedNonMonth?: number;
  /**
   * Said when the file was exported on a different basis than the version it
   * is being written to. Not a refusal - copying last year's OB onto PRB is a
   * legitimate thing to want - but the one mistake this feature makes easy,
   * so it is stated rather than left to be inferred from a large number.
   */
  basisWarning?: string;
  /** Present after an apply: what actually happened. */
  applied?: {
    nodes: number;
    measures: number;
    figures: number;
    failures: Array<{ row: number; message: string }>;
  };
  versionCode?: string;
}

interface Options {
  kiId: string;
  targetVersionId: string;
  allowCreate: boolean;
}

function readOptions(form: FormData): Options {
  return {
    kiId: String(form.get("kiId") ?? ""),
    targetVersionId: String(form.get("targetVersionId") ?? ""),
    allowCreate: form.get("allowCreate") === "on" || form.get("allowCreate") === "true",
  };
}

/**
 * The plan's view of the database: plain rows, no computed cells.
 *
 * Deliberately not `loadSheet`. The planner needs the *stored* value of a cell
 * on one named version to tell a row that changes nothing from one that does,
 * and the sheet's own cells carry a resolved target across versions instead -
 * a different question with a different answer.
 */
async function buildSnapshot(kiId: string, versionIds: string[]): Promise<Snapshot> {
  const ki = await prisma.ki.findUniqueOrThrow({ where: { id: kiId } });
  const [nodes, items, entries, orgUnits, businessUnits] = await Promise.all([
    prisma.node.findMany({
      where: { kiId },
      select: { id: true, kind: true, level: true, statement: true, parentId: true },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.controlItem.findMany({
      where: { measure: { node: { kiId } } },
      select: {
        id: true,
        code: true,
        measureId: true,
        measuredAs: true,
        unit: true,
        aggregation: true,
        direction: true,
        dicOrgUnit: { select: { code: true } },
        measure: { select: { name: true, nodeId: true, node: { select: { level: true } } } },
      },
    }),
    prisma.entry.findMany({
      where: { planVersionId: { in: versionIds }, controlItem: { measure: { node: { kiId } } } },
      select: {
        controlItemId: true,
        planVersionId: true,
        period: true,
        rawValue: true,
        computedValue: true,
        formula: true,
      },
    }),
    prisma.orgUnit.findMany({
      where: { type: { in: ["DIVISION", "DEPARTMENT"] } },
      select: { code: true },
    }),
    prisma.businessUnit.findMany({ select: { code: true } }),
  ]);

  const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
  const pathOf = (id: string): string[] => {
    const chain: string[] = [];
    let current = parentById.get(id) ?? null;
    while (current) {
      chain.unshift(current);
      current = parentById.get(current) ?? null;
    }
    return chain;
  };

  const values = new Map<string, Record<string, Record<PeriodKey, number | null>>>();
  for (const entry of entries) {
    const stored = entry.formula ? entry.computedValue : entry.rawValue;
    const byVersion = values.get(entry.controlItemId) ?? {};
    const byPeriod = byVersion[entry.planVersionId] ?? {};
    byPeriod[dateToPeriod(entry.period)] = stored === null ? null : Number(stored);
    byVersion[entry.planVersionId] = byPeriod;
    values.set(entry.controlItemId, byVersion);
  }

  return {
    months: kiMonths(kiStartYearOf(dateToPeriod(ki.startDate))),
    dicCodes: orgUnits.map((unit) => unit.code),
    businessUnitCodes: businessUnits.map((unit) => unit.code),
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      level: node.level,
      statement: node.statement,
      path: pathOf(node.id),
    })),
    items: items.map((item) => ({
      id: item.id,
      code: item.code,
      measureId: item.measureId,
      measureName: item.measure.name,
      measuredAs: item.measuredAs ?? "",
      nodeId: item.measure.nodeId,
      level: item.measure.node.level,
      dicCode: item.dicOrgUnit.code,
      unit: item.unit,
      aggregation: item.aggregation,
      direction: item.direction,
      values: values.get(item.id) ?? {},
    })),
  };
}

async function planFrom(form: FormData, options: Options) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ImportReadError("Choose a workbook to upload.");
  }
  const versions = await prisma.planVersion.findMany({ where: { kiId: options.kiId } });
  const target = versions.find((version) => version.id === options.targetVersionId);
  const actual = versions.find((version) => version.isActual);
  if (!target) throw new ImportReadError("Choose which version the Target column writes to.");
  if (!actual) throw new ImportReadError("This Ki has no actuals version to write to.");
  // Refused here rather than a thousand times over: saveEntry would reject
  // every cell individually, which is correct and unreadable.
  if (target.lockedAt) {
    throw new ImportReadError(
      `${target.code} is locked. Its figures are the record of what was committed, so nothing can ` +
        "be written to it - unlock it first if this genuinely needs to change.",
    );
  }

  const read = await readWorkbook(await file.arrayBuffer());
  const snapshot = await buildSnapshot(options.kiId, [target.id, actual.id]);
  const plan = buildImportPlan(read.rows, snapshot, {
    targetVersionId: target.id,
    actualVersionId: actual.id,
    allowCreate: options.allowCreate,
  });
  return { read, plan, target, actual };
}

export async function previewImport(_previous: unknown, form: FormData): Promise<ImportOutcome> {
  try {
    await requireRole("SUPER_ADMIN");
    const options = readOptions(form);
    if (!options.kiId) options.kiId = await currentKiId();
    const { read, plan, target } = await planFrom(form, options);
    return {
      ok: true,
      message: describePlan(plan),
      plan,
      problems: read.problems,
      skippedNonMonth: read.skippedNonMonth,
      versionCode: target.code,
      basisWarning: basisWarning(read.basis, target.code),
    };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/**
 * The export stamps every row with the basis its Target column was taken on.
 * "Latest forecast" is a resolution across versions rather than any one
 * version's stored figures, so writing it back into a named version copies
 * that resolution over what was there.
 */
function basisWarning(basis: string | null, versionCode: string): string | undefined {
  if (!basis) return undefined;
  const stamped = basis.replace(/^target:\s*/i, "").trim();
  if (!stamped || stamped.toLowerCase() === versionCode.toLowerCase()) return undefined;
  return (
    `This file's Target column was exported on "${stamped}" and is being written to ` +
    `${versionCode}. Export with ${versionCode} pinned if you meant to edit its own figures.`
  );
}

export async function applyImport(_previous: unknown, form: FormData): Promise<ImportOutcome> {
  try {
    const user = await requireSession();
    await requireRole("SUPER_ADMIN");
    const options = readOptions(form);
    if (!options.kiId) options.kiId = await currentKiId();
    const { read, plan, target, actual } = await planFrom(form, options);

    const failures: Array<{ row: number; message: string }> = [];

    // Structure first, parents before children: the plan lists a Goal before
    // the Theme under it, so one pass in order is enough.
    const nodeIds = new Map<string, string>();
    let createdNodes = 0;
    for (const node of plan.nodes) {
      const parentId = node.parentKey
        ? nodeIds.get(node.parentKey) ?? node.parentKey
        : null;
      const result = await addNode({
        kiId: options.kiId,
        parentId,
        statement: node.statement,
      });
      if (result.ok && result.id) {
        nodeIds.set(node.key, result.id);
        createdNodes += 1;
      } else {
        failures.push({ row: 0, message: `"${node.statement}": ${result.message}` });
      }
    }

    const orgUnits = await prisma.orgUnit.findMany({ select: { id: true, code: true } });
    const businessUnits = await prisma.businessUnit.findMany({ select: { id: true, code: true } });
    const orgUnitByCode = new Map(orgUnits.map((unit) => [unit.code.toLowerCase(), unit.id]));
    const businessUnitByCode = new Map(businessUnits.map((unit) => [unit.code.toLowerCase(), unit.id]));

    const itemIds = new Map<string, string>();
    let createdMeasures = 0;
    for (const measure of plan.measures) {
      const nodeId = nodeIds.get(measure.parentKey) ?? measure.parentKey;
      const result = await addControlItem({
        nodeId,
        name: measure.name,
        code: measure.code || undefined,
        measuredAs: measure.measuredAs || null,
        unit: measure.unit,
        direction: measure.direction,
        aggregation: measure.aggregation,
        decimalPlaces: measure.decimalPlaces,
        dicOrgUnitId: orgUnitByCode.get(measure.dicCode.toLowerCase()) ?? "",
        businessUnitId: businessUnitByCode.get(measure.businessUnitCode.toLowerCase()) ?? "",
        responsibleUserId: null,
      });
      if (result.ok && result.id) {
        itemIds.set(measure.key, result.id);
        createdMeasures += 1;
      } else {
        failures.push({ row: measure.row, message: `"${measure.name}": ${result.message}` });
      }
    }

    // Then the figures, one at a time through saveEntry so that a locked
    // version, a formula error or a permission refusal is reported for that
    // cell and never aborts the rest of the file.
    let written = 0;
    for (const figure of plan.figures) {
      const controlItemId =
        figure.controlItemId ?? (figure.measureKey ? itemIds.get(figure.measureKey) : undefined);
      if (!controlItemId) continue;
      try {
        await saveEntry(user, {
          controlItemId,
          period: figure.period,
          planVersionId: figure.kind === "TARGET" ? target.id : actual.id,
          input: figure.input,
        });
        written += 1;
      } catch (error) {
        failures.push({ row: figure.row, message: messageOf(error) });
      }
    }

    revalidatePath("/sheet");
    revalidatePath("/admin");
    revalidatePath("/insights");
    revalidatePath("/my-entries");

    return {
      ok: failures.length === 0,
      message: `Wrote ${written} ${plural(written, "figure")}${
        createdMeasures ? `, created ${createdMeasures} ${plural(createdMeasures, "measure")}` : ""
      }${createdNodes ? ` and ${createdNodes} ${plural(createdNodes, "row")} in the structure` : ""}${
        failures.length ? `. ${failures.length} could not be applied.` : "."
      }`,
      plan,
      problems: read.problems,
      skippedNonMonth: read.skippedNonMonth,
      versionCode: target.code,
      basisWarning: basisWarning(read.basis, target.code),
      applied: { nodes: createdNodes, measures: createdMeasures, figures: written, failures },
    };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/** The Ki the form did not name: whichever one this session is working on. */
async function currentKiId(): Promise<string> {
  const chosen = await activeKiId();
  if (chosen) return chosen;
  const ki =
    (await prisma.ki.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.ki.findFirstOrThrow({ orderBy: { startDate: "desc" } }));
  return ki.id;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function messageOf(error: unknown): string {
  if (error instanceof ImportReadError) return error.message;
  return error instanceof Error ? error.message : "That upload did not work.";
}
