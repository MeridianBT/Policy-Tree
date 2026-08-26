/**
 * What a quarter shows when there is only room for one number.
 *
 * The sheet has seventeen columns and shows target and actual together. The
 * cascade has neither the width nor the purpose for that: it is read as a wall
 * chart, so each quarter gets one figure and the reader has to be able to tell
 * at a glance which figure it is.
 *
 * The rule is the calendar's, not the data's: once a quarter has closed its
 * actual is the answer, and while it is still running or still ahead the
 * target is. A closed quarter with nothing keyed against it yet falls back to
 * its target and says so - showing a blank would read as "we scored nothing"
 * rather than "nobody has entered it".
 *
 * Pure and in its own module so the rule can be tested directly; see
 * components/sheet/filters.ts for the same reasoning.
 */

import { QUARTERS, quarterProgress, type QuarterCode, type QuarterProgress } from "@/lib/domain/period";
import type { SheetCell } from "@/lib/calc/row";

export interface QuarterFigure {
  quarter: QuarterCode;
  progress: QuarterProgress;
  /** Which figure `value` is: the recorded actual, or the standing target. */
  basis: "ACTUAL" | "TARGET";
  value: number | null;
  /** Only ever set on an ACTUAL - a target has nothing to be measured against. */
  achievement: number | null;
  symbol: string | null;
  symbolLabel: string | null;
  symbolColor: string | null;
}

export function quarterFigures(
  cells: readonly SheetCell[],
  kiStartYear: number,
  today: Date = new Date(),
): QuarterFigure[] {
  const byQuarter = new Map<string, SheetCell>();
  for (const cell of cells) {
    if (cell.kind === "QUARTER" && cell.quarter) byQuarter.set(cell.quarter, cell);
  }

  return QUARTERS.map((quarter) => {
    const cell = byQuarter.get(quarter) ?? null;
    const progress = quarterProgress(kiStartYear, quarter, today);
    const closed = progress === "COMPLETE" && cell?.actual != null;

    if (closed) {
      return {
        quarter,
        progress,
        basis: "ACTUAL" as const,
        value: cell!.actual,
        achievement: cell!.achievement,
        symbol: cell!.symbol,
        symbolLabel: cell!.symbolLabel,
        symbolColor: cell!.symbolColor,
      };
    }

    return {
      quarter,
      progress,
      basis: "TARGET" as const,
      value: cell?.target ?? null,
      achievement: null,
      symbol: null,
      symbolLabel: null,
      symbolColor: null,
    };
  });
}
