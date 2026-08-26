/**
 * The one-figure-per-quarter rule the cascade reads by.
 *
 * The thing worth pinning is that the choice belongs to the calendar and not
 * to the data: a quarter that has closed answers with what happened, and one
 * still running answers with what was promised. Get that backwards and the
 * cascade quietly reports a target as an achievement.
 */

import { describe, expect, it } from "vitest";
import { quarterFigures } from "@/components/sheet/quarter-figures";
import { QUARTERS, quarterMonths, quarterProgress } from "@/lib/domain/period";
import type { SheetCell } from "@/lib/calc/row";

const KI_START = 2026; // April 2026 - March 2027

function quarterCell(
  quarter: (typeof QUARTERS)[number],
  values: { target: number | null; actual: number | null },
): SheetCell {
  return {
    key: quarter,
    kind: "QUARTER",
    label: quarter,
    period: null,
    quarter,
    target: values.target,
    targetVersionCode: null,
    actual: values.actual,
    achievement:
      values.actual !== null && values.target ? values.actual / values.target : null,
    gap: null,
    gapSense: "NEUTRAL",
    symbol: values.actual !== null ? "〇" : null,
    symbolLabel: values.actual !== null ? "On track" : null,
    symbolColor: values.actual !== null ? "#2F8F5B" : null,
    error: null,
    locked: true,
  };
}

const CELLS: SheetCell[] = [
  quarterCell("Q1", { target: 1000, actual: 950 }),
  quarterCell("Q2", { target: 1100, actual: 400 }),
  quarterCell("Q3", { target: 1200, actual: null }),
  quarterCell("Q4", { target: 1300, actual: null }),
];

// Mid-August 2026: Q1 has closed, Q2 is being lived through, Q3 and Q4 are ahead.
const MID_Q2 = new Date(Date.UTC(2026, 7, 15));

describe("quarterProgress", () => {
  it("calls a quarter complete only once its last month has passed", () => {
    expect(quarterProgress(KI_START, "Q1", MID_Q2)).toBe("COMPLETE");
    expect(quarterProgress(KI_START, "Q2", MID_Q2)).toBe("CURRENT");
    expect(quarterProgress(KI_START, "Q3", MID_Q2)).toBe("FUTURE");
  });

  it("keeps the final month of a quarter inside it", () => {
    // June is Q1's last month, so on any day in June, Q1 is still running.
    const midJune = new Date(Date.UTC(2026, 5, 30));
    expect(quarterProgress(KI_START, "Q1", midJune)).toBe("CURRENT");
    // The moment July starts, Q1 has closed.
    expect(quarterProgress(KI_START, "Q1", new Date(Date.UTC(2026, 6, 1)))).toBe("COMPLETE");
  });

  it("handles Q4 crossing the calendar year", () => {
    expect(quarterMonths(KI_START, "Q4")).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(quarterProgress(KI_START, "Q4", new Date(Date.UTC(2027, 1, 10)))).toBe("CURRENT");
    expect(quarterProgress(KI_START, "Q4", new Date(Date.UTC(2027, 3, 1)))).toBe("COMPLETE");
  });
});

describe("quarterFigures", () => {
  it("shows the actual for a closed quarter and the target for an open one", () => {
    const figures = quarterFigures(CELLS, KI_START, MID_Q2);

    expect(figures.map((figure) => [figure.quarter, figure.basis, figure.value])).toEqual([
      ["Q1", "ACTUAL", 950],
      ["Q2", "TARGET", 1100],
      ["Q3", "TARGET", 1200],
      ["Q4", "TARGET", 1300],
    ]);
  });

  it("never reports achievement against a target that has not been run yet", () => {
    const figures = quarterFigures(CELLS, KI_START, MID_Q2);
    expect(figures[0].achievement).toBeCloseTo(0.95);
    for (const figure of figures.slice(1)) {
      expect(figure.achievement).toBeNull();
      expect(figure.symbol).toBeNull();
    }
  });

  it("does not let a part-year actual masquerade as the quarter's result", () => {
    // Q2 is half over and 400 of 1100 is in. Showing 400 as the quarter's
    // figure would read as a catastrophic miss rather than as work in flight.
    const q2 = quarterFigures(CELLS, KI_START, MID_Q2)[1];
    expect(q2.value).toBe(1100);
    expect(q2.basis).toBe("TARGET");
  });

  it("falls back to the target when a closed quarter has no actual keyed yet", () => {
    // Nobody has entered Q1. A blank would read as "we scored nothing"; the
    // target, marked as a target, reads as "nobody has told us".
    const nothingEntered = [quarterCell("Q1", { target: 1000, actual: null }), ...CELLS.slice(1)];
    const q1 = quarterFigures(nothingEntered, KI_START, MID_Q2)[0];
    expect(q1.progress).toBe("COMPLETE");
    expect(q1.basis).toBe("TARGET");
    expect(q1.value).toBe(1000);
  });

  it("returns all four quarters even when the row carries no cells at all", () => {
    const figures = quarterFigures([], KI_START, MID_Q2);
    expect(figures.map((figure) => figure.quarter)).toEqual([...QUARTERS]);
    expect(figures.every((figure) => figure.value === null)).toBe(true);
  });

  it("ignores month and Ki cells, which are not quarters", () => {
    const withNoise: SheetCell[] = [
      { ...quarterCell("Q1", { target: 1, actual: 1 }), key: "2026-04", kind: "MONTH", quarter: "Q1" },
      ...CELLS,
      { ...quarterCell("Q1", { target: 9, actual: 9 }), key: "KI", kind: "KI", quarter: null },
    ];
    expect(quarterFigures(withNoise, KI_START, MID_Q2)[0].value).toBe(950);
  });
});
