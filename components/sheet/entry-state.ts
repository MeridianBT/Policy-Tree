/**
 * The rules behind keying a figure on the sheet, kept apart from the grid that
 * draws them so they can be tested directly - the same reason
 * components/sheet/filters.ts and components/sheet/quarter-figures.ts sit
 * apart from the components that use them.
 *
 * Three things live here, and each one is a place where a plausible shortcut
 * would be wrong.
 *
 * `seedInput` decides what a box shows before anyone types. A cell holding a
 * formula must show the formula, not the number it last evaluated to;
 * otherwise tabbing through a cell would silently freeze "=SUM(...)" into a
 * literal. And a literal must be seeded unformatted - `formatValue` puts in
 * thousands separators for reading, and a box is for typing.
 *
 * `displayFor` decides what a box shows after this session has touched it.
 * The typed text stands until the sheet is re-read, so a number the reader
 * entered never flickers back to the old one while the save is in flight.
 *
 * `isDirty` decides whether a blur is worth a round trip. Tabbing across a row
 * of twelve months would otherwise write twelve identical values and count as
 * twelve edits in the audit trail.
 */

import type { SheetCell } from "@/lib/calc/row";

export type CellStatus = "SAVING" | "SAVED" | "ERROR";

export interface CellEditState {
  /** Exactly what was typed, kept so a formula survives a re-render. */
  input: string;
  status: CellStatus;
  /** What the server stored, once it has answered. */
  value: number | null;
  error: string | null;
}

/** Cells are addressed by measure and month; the version is the whole grid's. */
export function cellKey(controlItemId: string, period: string): string {
  return `${controlItemId}|${period}`;
}

/** What an untouched box shows: the formula as written, or a plain number. */
export function seedInput(cell: Pick<SheetCell, "target" | "targetFormula">, decimalPlaces: number): string {
  if (cell.targetFormula) return cell.targetFormula;
  if (cell.target === null || cell.target === undefined) return "";
  return cell.target.toFixed(decimalPlaces);
}

/** What the box shows now, preferring anything this session typed. */
export function displayFor(
  cell: Pick<SheetCell, "target" | "targetFormula">,
  decimalPlaces: number,
  edited: CellEditState | undefined,
): string {
  return edited ? edited.input : seedInput(cell, decimalPlaces);
}

/**
 * Whether a committed box differs from what is already there.
 *
 * A cell whose last save failed compares against the text that failed, so
 * blurring it again unchanged does not re-fire the same rejection, while
 * correcting it does.
 */
export function isDirty(
  cell: Pick<SheetCell, "target" | "targetFormula">,
  decimalPlaces: number,
  edited: CellEditState | undefined,
  raw: string,
): boolean {
  return raw.trim() !== displayFor(cell, decimalPlaces, edited).trim();
}

/**
 * The local stand-ins a freshly loaded sheet has made redundant.
 *
 * A saved cell's number is now in the model itself, so its stand-in retires
 * and the box goes back to reading the sheet - which is what lets a figure
 * someone else keyed appear rather than being masked forever by what this
 * session typed. A save still in flight, or an error nobody has dealt with
 * yet, stays exactly where it is.
 *
 * Returns the same map when nothing retires, so a caller can skip the update.
 */
export function retireSaved(cells: Map<string, CellEditState>): Map<string, CellEditState> {
  if (cells.size === 0) return cells;
  const next = new Map<string, CellEditState>();
  for (const [key, state] of cells) {
    if (state.status !== "SAVED") next.set(key, state);
  }
  return next.size === cells.size ? cells : next;
}
