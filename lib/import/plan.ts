/**
 * What an uploaded workbook would do to the plan, decided before anything is
 * written.
 *
 * One rule holds the whole feature together:
 *
 *   **The upload adds and updates. It never deletes, never renames, never
 *   moves.**
 *
 * A file is a snapshot of somebody's spreadsheet, not a statement of what the
 * plan should become. Read as the second, one stale column would re-file eighty
 * measures onto a division that never agreed to them, and a trimmed sheet would
 * erase a year. So: a row can write a figure, and it can bring something new
 * into existence, and that is all it can do. Renaming an Objective, moving a
 * measure between departments and deleting anything stay where somebody can see
 * the one row they are changing, and where the guards that protect closed
 * figures already live.
 *
 * Pure on purpose - no exceljs, no Prisma, no React. The file is already rows
 * by the time it arrives here, and the database is already a snapshot, so every
 * decision below is testable directly and none of them can be reached by
 * accident from somewhere else.
 */

import type { PeriodKey } from "@/lib/domain/period";

// ------------------------------------------------------------------ Snapshot

/** A Goal, Theme or Objective as it currently stands. */
export interface SnapshotNode {
  id: string;
  kind: "GOAL" | "THEME" | "OBJECTIVE";
  level: number;
  statement: string;
  /** Ancestor ids, outermost first. */
  path: string[];
}

export interface SnapshotItem {
  id: string;
  code: string;
  measureId: string;
  measureName: string;
  measuredAs: string;
  /** The Objective this item hangs under. */
  nodeId: string;
  level: number;
  dicCode: string;
  unit: string;
  aggregation: string;
  direction: string;
  /** Stored month values by version id, for spotting rows that change nothing. */
  values: Record<string, Record<PeriodKey, number | null>>;
}

export interface Snapshot {
  nodes: SnapshotNode[];
  items: SnapshotItem[];
  /** Months of the Ki being written to; anything outside is refused. */
  months: PeriodKey[];
  /** Org unit codes a new measure may be filed against. */
  dicCodes: string[];
  businessUnitCodes: string[];
}

// ---------------------------------------------------------------------- Plan

export type RefusalReason =
  | "UNKNOWN_CODE"
  | "OUTSIDE_KI"
  | "WOULD_MOVE"
  | "INCOMPLETE_NEW_ROW"
  | "LEVEL_4_NEEDS_THE_SHEET"
  | "UNKNOWN_DIC"
  | "UNKNOWN_BUSINESS_UNIT"
  | "UNKNOWN_SETTING";

export interface Refusal {
  row: number;
  code: string;
  reason: RefusalReason;
  detail: string;
}

/** A Goal, Theme or Objective the file would bring into existence. */
export interface NodeCreation {
  key: string;
  kind: "GOAL" | "THEME" | "OBJECTIVE";
  level: number;
  statement: string;
  /** The creation key or existing node id this hangs under; null for a Goal. */
  parentKey: string | null;
}

export interface MeasureCreation {
  key: string;
  name: string;
  /** Creation key or existing node id of the Objective. */
  parentKey: string;
  code: string;
  measuredAs: string;
  dicCode: string;
  businessUnitCode: string;
  unit: Unit;
  aggregation: Aggregation;
  direction: Direction;
  decimalPlaces: number;
  row: number;
}

export interface FigureWrite {
  row: number;
  /** Set when the item exists; otherwise it is created first. */
  controlItemId: string | null;
  /** Set when the item is being created by this same import. */
  measureKey: string | null;
  period: PeriodKey;
  kind: "TARGET" | "ACTUAL";
  input: string | number;
}

export interface ImportPlan {
  nodes: NodeCreation[];
  measures: MeasureCreation[];
  figures: FigureWrite[];
  /** Rows whose value already matches what is stored. */
  unchanged: number;
  refusals: Refusal[];
  /** Differences the upload deliberately leaves alone, so the preview is honest. */
  notes: Array<{ row: number; code: string; note: string }>;
}

export interface PlanOptions {
  /** Version id the Target column writes to. */
  targetVersionId: string;
  /** Version id the Actual column writes to, normally ACT. */
  actualVersionId: string;
  /**
   * Whether a row may bring something new into existence. Off by default, and
   * off in the form by default, so a typo in a Code is a refusal rather than a
   * new measure quietly joining the plan.
   */
  allowCreate: boolean;
}

/** A row from lib/import/read.ts, restated so this module needs no import. */
export interface PlanRow {
  row: number;
  code: string;
  period: PeriodKey;
  target: string | number | null;
  actual: string | number | null;
  goal: string;
  theme: string;
  objective: string;
  measure: string;
  controlItem: string;
  dic: string;
  businessUnit: string;
  level: number | null;
  unit: string;
  decimals: number | null;
  aggregation: string;
  direction: string;
}

type Unit = "PERCENT" | "CURRENCY" | "COUNT" | "RATIO" | "DAYS" | "INDEX";
type Aggregation = "SUM" | "AVERAGE" | "LATEST";
type Direction = "HIGHER_BETTER" | "LOWER_BETTER";

const UNITS: Unit[] = ["PERCENT", "CURRENCY", "COUNT", "RATIO", "DAYS", "INDEX"];
const AGGREGATIONS: Aggregation[] = ["SUM", "AVERAGE", "LATEST"];

/**
 * The export writes these for people to read - "Higher is better", "count" -
 * so they are read back the same way. Normalising here rather than in the
 * apply keeps every decision in one place and leaves the writer dumb.
 */
function readUnit(text: string): Unit | null {
  const upper = text.trim().toUpperCase();
  return (UNITS as string[]).includes(upper) ? (upper as Unit) : null;
}

function readAggregation(text: string): Aggregation | null {
  const upper = text.trim().toUpperCase();
  return (AGGREGATIONS as string[]).includes(upper) ? (upper as Aggregation) : null;
}

function readDirection(text: string): Direction | null {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes("lower")) return "LOWER_BETTER";
  if (lower.includes("higher")) return "HIGHER_BETTER";
  return null;
}

/** Statements are compared as somebody would read them, not byte for byte. */
function same(a: string, b: string): boolean {
  return a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildImportPlan(
  rows: readonly PlanRow[],
  snapshot: Snapshot,
  options: PlanOptions,
): ImportPlan {
  const plan: ImportPlan = {
    nodes: [],
    measures: [],
    figures: [],
    unchanged: 0,
    refusals: [],
    notes: [],
  };

  const itemByCode = new Map(snapshot.items.map((item) => [item.code.toLowerCase(), item]));
  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const months = new Set(snapshot.months);
  const dicCodes = new Set(snapshot.dicCodes.map((code) => code.toLowerCase()));
  const businessUnitCodes = new Set(snapshot.businessUnitCodes.map((code) => code.toLowerCase()));

  // Creations are deduplicated across rows: twelve months of one new measure
  // ask for the same Objective twelve times and must create it once.
  const nodeKeys = new Map<string, string>();
  const measureKeys = new Map<string, string>();

  /**
   * The Objective a row names, as an existing id or a creation key.
   *
   * Matching is by statement within a parent, which is what the file carries.
   * A statement that matches nothing is created rather than treated as a
   * rename of something nearby: guessing which existing row somebody meant to
   * rename is exactly the silent restructuring this module refuses to do.
   */
  function resolveObjective(row: PlanRow): string | null {
    const goalStatement = row.goal.replace(/^\d+\.\s*/, "").trim();
    if (!goalStatement || !row.objective) return null;

    const findChild = (
      parent: string | null,
      kind: SnapshotNode["kind"],
      statement: string,
    ): string | null => {
      const found = snapshot.nodes.find(
        (node) =>
          node.kind === kind &&
          same(node.statement, statement) &&
          (parent === null
            ? node.path.length === 0
            : node.path[node.path.length - 1] === parent),
      );
      return found?.id ?? null;
    };

    const create = (
      kind: SnapshotNode["kind"],
      level: number,
      statement: string,
      parentKey: string | null,
    ): string => {
      const key = `${kind}:${parentKey ?? "-"}:${statement.toLowerCase()}`;
      if (!nodeKeys.has(key)) {
        nodeKeys.set(key, key);
        plan.nodes.push({ key, kind, level, statement, parentKey });
      }
      return key;
    };

    let goalKey = findChild(null, "GOAL", goalStatement);
    if (!goalKey) {
      if (!options.allowCreate) return null;
      goalKey = create("GOAL", 1, goalStatement, null);
    }

    // A Theme is optional in the file only in the sense that a plan without
    // one is malformed; the export always writes it.
    const themeStatement = row.theme.trim();
    if (!themeStatement) return null;
    let themeKey = nodeKeys.get(`THEME:${goalKey}:${themeStatement.toLowerCase()}`) ?? null;
    themeKey ??= findChild(goalKey, "THEME", themeStatement);
    if (!themeKey) {
      if (!options.allowCreate) return null;
      themeKey = create("THEME", 2, themeStatement, goalKey);
    }

    const objectiveStatement = row.objective.trim();
    let objectiveKey =
      nodeKeys.get(`OBJECTIVE:${themeKey}:${objectiveStatement.toLowerCase()}`) ?? null;
    objectiveKey ??= findChild(themeKey, "OBJECTIVE", objectiveStatement);
    if (!objectiveKey) {
      if (!options.allowCreate) return null;
      objectiveKey = create("OBJECTIVE", 2, objectiveStatement, themeKey);
    }
    return objectiveKey;
  }

  for (const row of rows) {
    const figures: Array<{ kind: "TARGET" | "ACTUAL"; input: string | number }> = [];
    if (row.target !== null) figures.push({ kind: "TARGET", input: row.target });
    if (row.actual !== null) figures.push({ kind: "ACTUAL", input: row.actual });

    if (!months.has(row.period)) {
      plan.refusals.push({
        row: row.row,
        code: row.code,
        reason: "OUTSIDE_KI",
        detail: `${row.period} is not a month of this Ki.`,
      });
      continue;
    }

    const existing = row.code ? itemByCode.get(row.code.toLowerCase()) : undefined;

    if (existing) {
      // The file may say where it thinks the measure lives. If that disagrees
      // with where it actually lives, the row is refused rather than obeyed:
      // moving work between Objectives or departments is the both-ends
      // authority act updateControlItem guards, and a stale column must not
      // perform it in bulk.
      const node = nodeById.get(existing.nodeId);
      const movedObjective = row.objective && node && !same(node.statement, row.objective);
      const movedDic = row.dic && !same(existing.dicCode, row.dic);
      if (movedObjective || movedDic) {
        plan.refusals.push({
          row: row.row,
          code: existing.code,
          reason: "WOULD_MOVE",
          detail: movedObjective
            ? `is filed under "${node?.statement ?? ""}"; the file puts it under "${row.objective}". Move it on the sheet.`
            : `is filed to ${existing.dicCode}; the file says ${row.dic}. Move it on the sheet.`,
        });
        continue;
      }

      // Settings are read and reported, never applied. Direction and roll-up
      // reach back through closed figures, and a bulk path is the last place
      // to change what a stored number means.
      for (const [label, fileValue, current] of [
        ["Unit", row.unit, existing.unit],
        ["Roll-up", row.aggregation, existing.aggregation],
      ] as const) {
        if (fileValue && !same(fileValue, current)) {
          plan.notes.push({
            row: row.row,
            code: existing.code,
            note: `${label} in the file is "${fileValue}", the measure has "${current}". Left as it is.`,
          });
        }
      }

      for (const figure of figures) {
        const versionId =
          figure.kind === "TARGET" ? options.targetVersionId : options.actualVersionId;
        const stored = existing.values[versionId]?.[row.period];
        if (typeof figure.input === "number" && stored !== undefined && stored === figure.input) {
          plan.unchanged += 1;
          continue;
        }
        plan.figures.push({
          row: row.row,
          controlItemId: existing.id,
          measureKey: null,
          period: row.period,
          kind: figure.kind,
          input: figure.input,
        });
      }
      continue;
    }

    // ------------------------------------------------------------ new rows
    if (!options.allowCreate) {
      plan.refusals.push({
        row: row.row,
        code: row.code,
        reason: "UNKNOWN_CODE",
        detail: row.code
          ? `No measure has the code ${row.code}.`
          : "The row has no Code, so there is nothing to match it to.",
      });
      continue;
    }

    if (row.level === 4) {
      // A Level 4 branch carries an org unit and ladders into an Objective
      // above it, and the export states neither. Refusing is honest; guessing
      // would file a department's work under whatever looked closest.
      plan.refusals.push({
        row: row.row,
        code: row.code,
        reason: "LEVEL_4_NEEDS_THE_SHEET",
        detail:
          "A Level 4 department branch has to be started on the sheet, where the Objective it " +
          "ladders into is chosen.",
      });
      continue;
    }

    if (!row.measure || !row.objective || !row.goal || !row.theme) {
      plan.refusals.push({
        row: row.row,
        code: row.code,
        reason: "INCOMPLETE_NEW_ROW",
        detail: "A new measure needs a Goal, a Theme, an Objective and a Measure name.",
      });
      continue;
    }
    if (!row.dic || !dicCodes.has(row.dic.toLowerCase())) {
      plan.refusals.push({
        row: row.row,
        code: row.code,
        reason: "UNKNOWN_DIC",
        detail: row.dic ? `${row.dic} is not a division or department.` : "A new measure needs a Department.",
      });
      continue;
    }
    if (!row.businessUnit || !businessUnitCodes.has(row.businessUnit.toLowerCase())) {
      plan.refusals.push({
        row: row.row,
        code: row.code,
        reason: "UNKNOWN_BUSINESS_UNIT",
        detail: row.businessUnit
          ? `${row.businessUnit} is not a business unit.`
          : "A new measure needs a business unit.",
      });
      continue;
    }

    const parentKey = resolveObjective(row);
    if (!parentKey) {
      plan.refusals.push({
        row: row.row,
        code: row.code,
        reason: "INCOMPLETE_NEW_ROW",
        detail: `Could not place "${row.measure}" - its Goal, Theme and Objective did not resolve.`,
      });
      continue;
    }

    // Unit, roll-up and direction decide what a stored number means, so an
    // unrecognised one is refused rather than defaulted into: a measure
    // silently created as a summed count when the file said percent would
    // read wrong for a year.
    const unit = row.unit ? readUnit(row.unit) : "COUNT";
    const aggregation = row.aggregation ? readAggregation(row.aggregation) : "SUM";
    const direction = row.direction ? readDirection(row.direction) : "HIGHER_BETTER";
    if (!unit || !aggregation || !direction) {
      plan.refusals.push({
        row: row.row,
        code: row.code,
        reason: "UNKNOWN_SETTING",
        detail:
          `Unit "${row.unit}", roll-up "${row.aggregation}" and direction "${row.direction}" - ` +
          "one of them is not a value this application knows.",
      });
      continue;
    }

    const measureKey = `${parentKey}::${row.measure.toLowerCase()}::${row.controlItem.toLowerCase()}`;
    if (!measureKeys.has(measureKey)) {
      measureKeys.set(measureKey, measureKey);
      plan.measures.push({
        key: measureKey,
        name: row.measure,
        parentKey,
        code: row.code,
        measuredAs: row.controlItem,
        dicCode: row.dic,
        businessUnitCode: row.businessUnit,
        unit,
        aggregation,
        direction,
        decimalPlaces: row.decimals ?? 0,
        row: row.row,
      });
    }

    for (const figure of figures) {
      plan.figures.push({
        row: row.row,
        controlItemId: null,
        measureKey,
        period: row.period,
        kind: figure.kind,
        input: figure.input,
      });
    }
  }

  return plan;
}

/** One line saying what the plan would do, for the preview's summary. */
export function describePlan(plan: ImportPlan): string {
  const parts: string[] = [];
  const targets = plan.figures.filter((figure) => figure.kind === "TARGET").length;
  const actuals = plan.figures.filter((figure) => figure.kind === "ACTUAL").length;
  if (targets) parts.push(`${targets} target${targets === 1 ? "" : "s"}`);
  if (actuals) parts.push(`${actuals} actual${actuals === 1 ? "" : "s"}`);
  if (plan.nodes.length) parts.push(`${plan.nodes.length} new rows in the structure`);
  if (plan.measures.length) parts.push(`${plan.measures.length} new measures`);
  if (plan.unchanged) parts.push(`${plan.unchanged} already matching`);
  if (plan.refusals.length) parts.push(`${plan.refusals.length} refused`);
  return parts.length ? parts.join(" · ") : "Nothing to do.";
}
