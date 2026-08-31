/**
 * The shape the sheet screens consume. Everything here is plain JSON so it can
 * cross the server/client boundary, and every number in it has already been
 * through lib/calc.
 */

import type { SheetCell } from "@/lib/calc/row";
import type { EvaluationBandSpec, Unit, VersionSpec } from "@/lib/calc/types";
import type { PeriodKey } from "@/lib/domain/period";

export type SheetRowKind = "GOAL" | "OBJECTIVE" | "CONTROL_ITEM";

/**
 * A row's identity in a list, which its `id` alone cannot give.
 *
 * A GroupRow's id is a Node id and a ControlItemRow's is a Control Item id -
 * two different tables, so nothing stops them colliding. On any database that
 * came through the flatten migration they collide by construction: that
 * migration reused each Measure's id for the Objective replacing it, and the
 * Measure migration before it had reused each Control Item's id for the
 * Measure. Every Objective on such a database therefore shares its id with its
 * own first Control Item, and an Objective that carries a header renders both
 * rows - two React children with the same key, which React explicitly calls
 * unsupported and which mis-reconciles or throws on the next update.
 *
 * So anything keying rows in a list, or resolving one by id, uses this rather
 * than `id`. The kind is part of the identity because the two rows really are
 * different things: a statement, and a figure kept against it.
 */
export function rowKey(row: Pick<SheetRowModel, "kind" | "id">): string {
  return `${row.kind === "CONTROL_ITEM" ? "item" : "group"}:${row.id}`;
}

export interface GroupRow {
  id: string;
  kind: "GOAL" | "OBJECTIVE";
  level: number;
  statement: string;
  /** Level 1 Goals only: their position in the company's priority list. */
  ordinal?: number | null;
  /** Ancestor group ids, outermost first. Drives collapse and the context bar. */
  path: string[];
  /** Control item ids beneath this group, for filtering and counts. */
  controlItemIds: string[];
  /** Level 4 only: the Level 1-3 Objective this group ladders into. */
  laddersTo?: string | null;
  /** The org unit this row belongs to, for scoped structure editing. */
  orgUnitId?: string | null;
}

export interface ControlItemRow {
  id: string;
  kind: "CONTROL_ITEM";
  code: string;
  /**
   * The Objective's statement, carried on every one of its Control Items so
   * that a row always knows what it is called. The sheet prints it once per
   * Objective - see `firstOfObjective` - and the screens that show one line per
   * Control Item with no grouping to lean on pair it with `measuredAs`.
   */
  name: string;
  /** The Objective this row records. Its statement is the row's `name`. */
  objectiveId: string;
  /** True on the first Control Item of its Objective, in sheet order. */
  firstOfObjective: boolean;
  /** How many Control Items this row's Objective carries, itself included. */
  objectiveItemCount: number;
  /** How the target and actual are measured, e.g. "Units sold", "% of sales". */
  measuredAs: string;
  unit: Unit;
  decimalPlaces: number;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  aggregation: "SUM" | "AVERAGE" | "LATEST";
  dicCode: string;
  dicName: string;
  dicOrgUnitId: string;
  /** The business unit this measure belongs to: AUTO, MC, PP or SHARED. */
  businessUnitCode: string;
  businessUnitName: string;
  businessUnitId: string;
  /**
   * `measuredAs` exactly as stored, which is null when nobody has filled it
   * in. `measuredAs` above carries the readable fallback the sheet shows
   * instead; the edit form needs the raw value so that opening and saving a
   * measure does not quietly turn "not set" into the literal word "Count".
   */
  measuredAsRaw: string | null;
  /**
   * Who keys this measure. Needed on the client only so the entry grid can
   * mirror `canEditControlItem`, which lets a named responsible person key a
   * measure filed outside their own org unit. The server re-checks every save.
   */
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  level: number;
  path: string[];
  /** Level 4 only: the Level 1-3 objective this ladders into. */
  laddersTo: string | null;
  cells: SheetCell[];
  /** Ki-level symbol, lifted out of the cells for callers that want only it. */
  kiSymbol: string | null;
}

export type SheetRowModel = (GroupRow | ControlItemRow) & { kind: SheetRowKind };

export interface SheetModel {
  kiCode: string;
  kiId: string;
  kiStartYear: number;
  months: PeriodKey[];
  versions: VersionSpec[];
  bands: EvaluationBandSpec[];
  rows: SheetRowModel[];
  /**
   * Every Division and Department, for the filter control, the add-measure
   * form and the "add department" branch. Flat, with `parentCode` carrying
   * the hierarchy: a Department's parentCode is its Division's code, so the
   * client can filter "this division and everything beneath it" without a
   * second round trip.
   */
  dics: Array<{
    id: string;
    code: string;
    name: string;
    type: "DIVISION" | "DEPARTMENT";
    parentCode: string | null;
  }>;
  /**
   * Every business unit, for the filter control and the add-measure form.
   * Every one of them, not merely those already carrying a measure: a new
   * measure has to be assignable to a unit the plan has not reached yet.
   */
  businessUnits: Array<{ id: string; code: string; name: string }>;
}
