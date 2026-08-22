/**
 * The shape the sheet screens consume. Everything here is plain JSON so it can
 * cross the server/client boundary, and every number in it has already been
 * through lib/calc.
 */

import type { SheetCell } from "@/lib/calc/row";
import type { EvaluationBandSpec, Unit, VersionSpec } from "@/lib/calc/types";
import type { PeriodKey } from "@/lib/domain/period";

export type SheetRowKind = "GOAL" | "THEME" | "OBJECTIVE" | "CONTROL_ITEM";

export interface GroupRow {
  id: string;
  kind: "GOAL" | "THEME" | "OBJECTIVE";
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
}

export interface ControlItemRow {
  id: string;
  kind: "CONTROL_ITEM";
  code: string;
  name: string;
  /** How the target and actual are measured, e.g. "Units sold", "% of sales". */
  measuredAs: string;
  unit: Unit;
  decimalPlaces: number;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  aggregation: "SUM" | "AVERAGE" | "LATEST";
  dicCode: string;
  dicName: string;
  responsibleUserName: string | null;
  level: number;
  path: string[];
  /** Level 4 only: the Level 1-3 objective this ladders into. */
  laddersTo: string | null;
  cells: SheetCell[];
  /** Ki-level symbol, used by the symbol filter. */
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
  /** Distinct DIC codes present, for the filter control. */
  dics: Array<{ code: string; name: string }>;
  /** Theme statements present, for the filter control. */
  themes: Array<{ id: string; statement: string }>;
}
