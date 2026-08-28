/**
 * Which measures are behind, right now.
 *
 * "Currently below target" needs a definition, and the two obvious ones are
 * both wrong.
 *
 * The Ki total is wrong because it rolls a full year of target against a
 * part year of actual: in August a measure tracking perfectly reads about 33%
 * against its Ki target, so every row would be "below target" every year until
 * March. The current calendar month is wrong because the month being closed
 * usually has nothing keyed yet, so a filter run on the first of the month
 * would come back empty.
 *
 * What a reviewer means is the last month this measure actually reported. So
 * that is what this uses, per measure rather than per sheet - one division
 * keyed to July and another to August are both answering honestly about
 * themselves, and holding them to a common month would misreport whichever is
 * ahead.
 *
 * A measure with no actual at all is not behind, it is unkeyed. Those are a
 * different problem with a different screen (/my-entries), and folding them in
 * here would put "nobody has told us" and "we are losing" in one list.
 */

import type { ControlItemRow } from "@/lib/sheet/types";
import type { SheetCell } from "@/lib/calc/row";

/** The last month column carrying an actual, or null when none does. */
export function latestReportedMonth(cells: readonly SheetCell[]): SheetCell | null {
  let latest: SheetCell | null = null;
  for (const cell of cells) {
    if (cell.kind !== "MONTH") continue;
    if (cell.actual === null || cell.actual === undefined) continue;
    latest = cell;
  }
  return latest;
}

/**
 * Behind as of its own last reported month.
 *
 * Achievement is already direction-aware - `lib/calc/achievement.ts` inverts
 * for a lower-is-better measure - so one comparison against 1 is correct for
 * cost items and volume items alike, with no special casing here.
 */
export function isBelowTarget(row: Pick<ControlItemRow, "cells">): boolean {
  const cell = latestReportedMonth(row.cells);
  if (!cell) return false;
  if (cell.achievement === null || cell.achievement === undefined) return false;
  return cell.achievement < 1;
}
