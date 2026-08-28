/**
 * "Currently below target".
 *
 * The definition is the whole feature. Two plausible ones are wrong and both
 * are tested here as the thing this must not do: the Ki total (a full year of
 * target against a part year of actual, so everything looks behind until
 * March) and the calendar month (usually not keyed yet, so the filter comes
 * back empty on the first of the month).
 */

import { describe, expect, it } from "vitest";
import { isBelowTarget, latestReportedMonth } from "@/components/sheet/below-target";
import type { SheetCell } from "@/lib/calc/row";

function month(period: string, target: number | null, actual: number | null, achievement: number | null): SheetCell {
  return {
    key: period, kind: "MONTH", label: period, period, quarter: "Q1",
    target, targetVersionCode: "OB", targetFormula: null, targetEditable: true,
    actual, achievement, gap: null, gapSense: "NEUTRAL",
    symbol: null, symbolLabel: null, symbolColor: null, error: null, locked: false,
  };
}

const kiCell = (achievement: number | null): SheetCell => ({
  ...month("KI", 12000, 4000, achievement), key: "KI", kind: "KI", period: null, quarter: null,
});

describe("latestReportedMonth", () => {
  it("finds the last month carrying an actual", () => {
    const cells = [
      month("2026-04", 100, 90, 0.9),
      month("2026-05", 100, 110, 1.1),
      month("2026-06", 100, null, null),
    ];
    expect(latestReportedMonth(cells)?.period).toBe("2026-05");
  });

  it("ignores quarters and the Ki total", () => {
    const cells = [month("2026-04", 100, 90, 0.9), kiCell(0.33)];
    expect(latestReportedMonth(cells)?.period).toBe("2026-04");
  });

  it("is null when nothing has been reported", () => {
    expect(latestReportedMonth([month("2026-04", 100, null, null)])).toBeNull();
    expect(latestReportedMonth([])).toBeNull();
  });
});

describe("isBelowTarget", () => {
  it("uses the last reported month, not the Ki total", () => {
    // The Ki total reads 33% in August for a measure tracking perfectly,
    // because a year of target sits against four months of actual. Judging on
    // it would mark every measure behind, every year, until March.
    const row = {
      cells: [
        month("2026-04", 1000, 1000, 1.0),
        month("2026-05", 1000, 1050, 1.05),
        month("2026-06", 1000, null, null),
        kiCell(0.33),
      ],
    };
    expect(isBelowTarget(row)).toBe(false);
  });

  it("is not fooled by an unkeyed current month", () => {
    // June has a target and no actual. The answer must come from May.
    const row = {
      cells: [month("2026-04", 100, 80, 0.8), month("2026-05", 100, 70, 0.7), month("2026-06", 100, null, null)],
    };
    expect(isBelowTarget(row)).toBe(true);
  });

  it("is true below 100% and false at or above it", () => {
    expect(isBelowTarget({ cells: [month("2026-04", 100, 99, 0.99)] })).toBe(true);
    expect(isBelowTarget({ cells: [month("2026-04", 100, 100, 1)] })).toBe(false);
    expect(isBelowTarget({ cells: [month("2026-04", 100, 101, 1.01)] })).toBe(false);
  });

  it("reads a lower-is-better measure correctly without special casing", () => {
    // Achievement is already inverted upstream, so a cost item that came in
    // under budget carries an achievement above 1 and is not behind.
    const underBudget = { cells: [month("2026-04", 100, 80, 1.2)] };
    const overBudget = { cells: [month("2026-04", 100, 120, 0.8)] };
    expect(isBelowTarget(underBudget)).toBe(false);
    expect(isBelowTarget(overBudget)).toBe(true);
  });

  it("treats a measure with nothing keyed as not behind", () => {
    // Unkeyed is a different problem with a different screen. Folding it in
    // would put "nobody has told us" and "we are losing" in one list.
    const row = { cells: [month("2026-04", 100, null, null), month("2026-05", 100, null, null)] };
    expect(isBelowTarget(row)).toBe(false);
  });

  it("treats a reported month with no target as not behind", () => {
    // No target means nothing to be behind of; achievement is null.
    expect(isBelowTarget({ cells: [month("2026-04", null, 50, null)] })).toBe(false);
  });
});
