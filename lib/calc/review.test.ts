/**
 * The month-end review's rule.
 *
 * The cases here are the ones that would otherwise be found in a meeting: a
 * lower-is-better measure ranked as though its sign were flipped, a measure
 * nobody keyed counted as failing, everything reading as "improved" in April
 * because there is no March to compare with, and a list where every row is
 * moving because a rounding difference counts as movement.
 */

import { describe, expect, it } from "vitest";
import { ATTENTION_LIMIT, FLAT_BAND, buildReview, latestReviewableMonth } from "@/lib/calc/review";
import type { ControlItemRow, SheetRowModel } from "@/lib/sheet/types";
import type { SheetCell } from "@/lib/calc/row";

const MONTHS = ["2026-04", "2026-05", "2026-06"];

function cell(period: string, values: Partial<SheetCell> = {}): SheetCell {
  return {
    key: period,
    kind: "MONTH",
    label: period,
    period,
    quarter: null,
    target: 100,
    targetVersionCode: "OB",
    targetFormula: null,
    targetEditable: false,
    actual: 100,
    achievement: 1,
    gap: 0,
    gapSense: "FAVOURABLE",
    symbol: "〇",
    symbolLabel: "On target",
    symbolColor: null,
    error: null,
    locked: false,
    ...values,
  };
}

function item(
  id: string,
  cells: SheetCell[],
  extra: Partial<ControlItemRow> = {},
): SheetRowModel {
  return {
    id,
    kind: "CONTROL_ITEM",
    objectiveId: `measure-${id}`,
    firstOfObjective: true,
    objectiveItemCount: 1,
    code: id,
    name: `Item ${id}`,
    measuredAs: "Units",
    unit: "COUNT",
    decimalPlaces: 0,
    direction: "HIGHER_BETTER",
    aggregation: "SUM",
    dicCode: "AUTO",
    dicName: "Automotive",
    dicOrgUnitId: "auto",
    businessUnitId: "bu1",
    measuredAsRaw: null,
    businessUnitCode: "AUTO",
    businessUnitName: "Automobiles",
    responsibleUserId: null,
    responsibleUserName: null,
    level: 2,
    path: [],
    laddersTo: null,
    cells,
    kiSymbol: null,
    ...extra,
  } as ControlItemRow;
}

/** A measure whose achievement went from `before` to `after`. */
function moving(id: string, before: number, after: number, extra?: Partial<ControlItemRow>) {
  return item(
    id,
    [
      cell("2026-04", { achievement: before }),
      cell("2026-05", { achievement: after }),
      cell("2026-06", { actual: null, achievement: null }),
    ],
    extra,
  );
}

const review = (rows: SheetRowModel[], period = "2026-05", previous: string | null = "2026-04") =>
  buildReview(rows, period, previous, MONTHS);

describe("latestReviewableMonth", () => {
  it("is the last month anybody keyed an actual into", () => {
    const rows = [
      item("A", [cell("2026-04"), cell("2026-05"), cell("2026-06", { actual: null })]),
    ];
    expect(latestReviewableMonth(rows, MONTHS)).toBe("2026-05");
  });

  it("takes the latest month any measure reported, not every measure", () => {
    // One division keyed May and another has only April. There is something
    // to review in May, so May is the month.
    const rows = [
      item("A", [cell("2026-04"), cell("2026-05", { actual: null })]),
      item("B", [cell("2026-04"), cell("2026-05")]),
    ];
    expect(latestReviewableMonth(rows, MONTHS)).toBe("2026-05");
  });

  it("is null before anything is keyed at all", () => {
    const rows = [item("A", [cell("2026-04", { actual: null })])];
    expect(latestReviewableMonth(rows, MONTHS)).toBeNull();
  });
});

describe("reporting", () => {
  it("separates what was not reported from what was not planned", () => {
    const rows = [
      item("REPORTED", [cell("2026-05")]),
      item("NO-ACTUAL", [cell("2026-05", { actual: null, achievement: null })]),
      item("NO-TARGET", [cell("2026-05", { target: null, achievement: null })]),
    ];
    const { reporting } = review(rows);
    expect(reporting.expected).toBe(3);
    expect(reporting.reported).toBe(2);
    expect(reporting.missing.map((line) => line.code)).toEqual(["NO-ACTUAL"]);
    expect(reporting.untargeted.map((line) => line.code)).toEqual(["NO-TARGET"]);
  });

  it("never puts an unreported measure in the attention list", () => {
    // "Nobody has told us" and "we are losing" are different problems and must
    // not share a list.
    const rows = [item("QUIET", [cell("2026-05", { actual: null, achievement: null })])];
    const { reporting, attention } = review(rows);
    expect(reporting.missing).toHaveLength(1);
    expect(attention).toHaveLength(0);
  });

  it("groups the chase list by who to ask, most outstanding first", () => {
    // Eighty-two measure names is a wall; "the Automotive Director owes
    // twelve" is a sentence somebody can act on.
    const blank = { actual: null, achievement: null };
    const rows = [
      item("A1", [cell("2026-05", blank)], { responsibleUserName: "Sam" }),
      item("A2", [cell("2026-05", blank)], { responsibleUserName: "Sam" }),
      item("A3", [cell("2026-05", blank)], { responsibleUserName: "Bo" }),
      item("O1", [cell("2026-05", blank)], { dicCode: "OX", dicName: "OX" }),
    ];
    const groups = review(rows).reporting.missingByOwner;
    expect(groups.map((group) => [group.owner, group.lines.length])).toEqual([
      ["Sam", 2],
      ["Bo", 1],
      // An unnamed measure groups under its own org unit: "who owns this" is
      // a question for a division, not for the company.
      [null, 1],
    ]);
    expect(groups[2].dicCode).toBe("OX");
  });

  it("keeps unnamed measures in separate groups per division", () => {
    const blank = { actual: null, achievement: null };
    const rows = [
      item("A1", [cell("2026-05", blank)], { dicCode: "AUTO", dicName: "Automotive" }),
      item("O1", [cell("2026-05", blank)], { dicCode: "OX", dicName: "OX" }),
    ];
    const groups = review(rows).reporting.missingByOwner;
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.owner === null)).toBe(true);
  });

  it("sorts the flat list by division, then person, then code", () => {
    const blank = { actual: null, achievement: null };
    const rows = [
      item("Z1", [cell("2026-05", blank)], { dicCode: "OX", responsibleUserName: "Ada" }),
      item("A2", [cell("2026-05", blank)], { dicCode: "AUTO", responsibleUserName: "Sam" }),
      item("A1", [cell("2026-05", blank)], { dicCode: "AUTO", responsibleUserName: "Sam" }),
      item("A3", [cell("2026-05", blank)], { dicCode: "AUTO", responsibleUserName: "Bo" }),
    ];
    expect(review(rows).reporting.missing.map((line) => line.code)).toEqual([
      "A3",
      "A1",
      "A2",
      "Z1",
    ]);
  });
});

describe("attention", () => {
  it("ranks worsening above flat above recovering", () => {
    const rows = [
      moving("RECOVERING", 0.6, 0.8),
      moving("WORSENING", 0.95, 0.85),
      moving("FLAT", 0.9, 0.9),
    ];
    expect(review(rows).attention.map((line) => line.code)).toEqual([
      "WORSENING",
      "FLAT",
      "RECOVERING",
    ]);
  });

  it("puts the worst first inside a bucket", () => {
    const rows = [moving("SHALLOW", 0.99, 0.9), moving("DEEP", 0.8, 0.5)];
    expect(review(rows).attention.map((line) => line.code)).toEqual(["DEEP", "SHALLOW"]);
  });

  it("keeps a lower-is-better measure in the same list as the rest", () => {
    // Achievement is inverted upstream by lib/calc/achievement.ts, so nothing
    // in this module compares differently for a cost measure. A regression
    // here would silently drop every cost item off the review.
    const rows = [
      moving("COST", 1.1, 0.7, { direction: "LOWER_BETTER" }),
      moving("VOLUME", 1.1, 0.9),
    ];
    expect(review(rows).attention.map((line) => line.code)).toEqual(["COST", "VOLUME"]);
  });

  it("leaves a measure that is at or above target out of it", () => {
    const rows = [moving("EXACT", 0.9, 1), moving("AHEAD", 1.2, 1.4), moving("BEHIND", 1, 0.99)];
    expect(review(rows).attention.map((line) => line.code)).toEqual(["BEHIND"]);
  });

  it("caps the list and counts what the cap left out", () => {
    // A page that lists every measure below target has become the sheet
    // again, and the sheet does that better. The cap keeps the top of a
    // ranking that already puts what is falling first.
    const falling = Array.from({ length: ATTENTION_LIMIT + 4 }, (_, i) =>
      moving(`W${i}`, 0.95, 0.5 + i / 100),
    );
    const holding = [moving("FLAT1", 0.7, 0.7), moving("FLAT2", 0.71, 0.71)];
    const { attention, attentionOverflow, attentionTotal } = review([...falling, ...holding]);

    expect(attention).toHaveLength(ATTENTION_LIMIT);
    expect(attentionTotal).toBe(ATTENTION_LIMIT + 6);
    expect(attentionOverflow.count).toBe(6);
    // Four of the six cut are still falling, and saying so is the difference
    // between a cap and a silent truncation.
    expect(attentionOverflow.worsening).toBe(4);
  });

  it("reports no overflow when everything fits", () => {
    const { attentionOverflow, attentionTotal } = review([moving("A", 0.9, 0.8)]);
    expect(attentionTotal).toBe(1);
    expect(attentionOverflow).toEqual({ count: 0, worsening: 0 });
  });

  it("carries the whole Ki on the line, for the row's own history strip", () => {
    const rows = [moving("A", 0.8, 0.7)];
    const [line] = review(rows).attention;
    expect(line.months.map((month) => month.period)).toEqual(MONTHS);
    expect(line.previousAchievement).toBeCloseTo(0.8);
    expect(line.change).toBeCloseTo(-0.1);
  });
});

describe("movement", () => {
  it("treats a drift smaller than a point as flat", () => {
    expect(review([moving("A", 0.9, 0.9 + FLAT_BAND / 2)]).attention[0].movement).toBe("FLAT");
    expect(review([moving("B", 0.9, 0.9 - FLAT_BAND / 2)]).attention[0].movement).toBe("FLAT");
  });

  it("counts a point or more as movement", () => {
    expect(review([moving("A", 0.9, 0.88)]).attention[0].movement).toBe("WORSENING");
    expect(review([moving("B", 0.8, 0.9)]).attention[0].movement).toBe("RECOVERING");
  });

  it("calls the first month of the Ki new rather than improved", () => {
    // April has no March to compare with. Reading "no previous" as a rise
    // would open the year with every measure marked improving.
    const rows = [item("A", [cell("2026-04", { achievement: 0.8 })])];
    const { attention, movers } = buildReview(rows, "2026-04", null, MONTHS);
    expect(attention[0].movement).toBe("NEW");
    expect(attention[0].change).toBeNull();
    expect(movers.up).toHaveLength(0);
    expect(movers.down).toHaveLength(0);
  });
});

describe("movers", () => {
  it("takes the biggest gains and falls, whichever side of target they sit", () => {
    const rows = [
      moving("RECOVERING-BUT-FAILING", 0.6, 0.85),
      moving("SLIPPING-BUT-FINE", 1.3, 1.05),
      moving("STEADY", 1, 1),
      moving("SMALL-GAIN", 1, 1.02),
    ];
    const { movers } = review(rows);
    expect(movers.up.map((line) => line.code)).toEqual([
      "RECOVERING-BUT-FAILING",
      "SMALL-GAIN",
    ]);
    expect(movers.down.map((line) => line.code)).toEqual(["SLIPPING-BUT-FINE"]);
  });

  it("keeps at most three a side, largest first", () => {
    const rows = [
      moving("D1", 1, 0.5),
      moving("D2", 1, 0.6),
      moving("D3", 1, 0.7),
      moving("D4", 1, 0.8),
    ];
    expect(review(rows).movers.down.map((line) => line.code)).toEqual(["D1", "D2", "D3"]);
  });

  it("leaves out anything that only drifted", () => {
    expect(review([moving("A", 0.9, 0.9 + FLAT_BAND / 2)]).movers.up).toHaveLength(0);
  });
});
