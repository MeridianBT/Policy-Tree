/**
 * Period roll-up. Quarters and Ki totals are never stored - they are derived
 * from the monthly grain by applying the Control Item's aggregation.
 *
 * Months with no value are excluded, not treated as zero. If no month in the
 * range holds a value the result is null, which the UI renders as an em dash.
 */

import type { PeriodKey } from "@/lib/domain/period";
import type { Aggregation, PeriodValues } from "./types";

/**
 * Roll a set of monthly values up over `periods`.
 *
 * - SUM     adds the populated months (revenue, volume, units)
 * - AVERAGE means the populated months only (engagement %, ratios)
 * - LATEST  takes the most recent populated month, which is not necessarily
 *           the last month of the range (headcount, closing balance)
 */
export function rollUp(
  values: PeriodValues,
  periods: readonly PeriodKey[],
  aggregation: Aggregation,
): number | null {
  const populated: Array<{ period: PeriodKey; value: number }> = [];
  for (const period of periods) {
    const cell = values[period];
    if (cell && cell.value !== null && cell.value !== undefined && Number.isFinite(cell.value)) {
      populated.push({ period, value: cell.value });
    }
  }

  if (populated.length === 0) return null;

  switch (aggregation) {
    case "SUM":
      return populated.reduce((total, cell) => total + cell.value, 0);
    case "AVERAGE":
      return populated.reduce((total, cell) => total + cell.value, 0) / populated.length;
    case "LATEST": {
      // Period keys are "YYYY-MM", so lexical order is chronological order.
      let latest = populated[0];
      for (const cell of populated) {
        if (cell.period > latest.period) latest = cell;
      }
      return latest.value;
    }
  }
}

/** True when at least one period in the range holds a value. */
export function hasAnyValue(values: PeriodValues, periods: readonly PeriodKey[]): boolean {
  return periods.some((period) => {
    const cell = values[period];
    return cell != null && cell.value !== null && cell.value !== undefined;
  });
}
