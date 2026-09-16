/**
 * The landscape bracket: what goes on which side, and how tall each block is.
 *
 * The row arithmetic is the part that breaks silently. A span one too short
 * leaves a stray cell hanging outside its Goal; one too long pushes the next
 * Goal's first row into the previous block. Neither throws, and both look like
 * a CSS problem rather than a counting one - so the counting is tested here,
 * away from any rendering.
 *
 * The case worth naming is the second one below: a Level 2 heading's children
 * include both its own Control Items *and* the Level 3 Objectives deployed
 * from it. Reading those children without checking their level prints a Level
 * 3 statement in the Level 2 column, which reads as real and is not.
 */

import { describe, expect, it } from "vitest";
import { buildLandscape, landscapeFit, ROWS_PER_SLIDE } from "@/components/sheet/landscape";
import type { ControlItemRow, GroupRow, SheetRowModel } from "@/lib/sheet/types";
import type { SheetCell } from "@/lib/calc/row";

function group(id: string, level: number, path: string[], overrides: Partial<GroupRow> = {}): SheetRowModel {
  return {
    id,
    kind: level === 1 ? "GOAL" : "OBJECTIVE",
    level,
    statement: `Statement ${id}`,
    path,
    controlItemIds: [],
    ...overrides,
  } as SheetRowModel;
}

/** A Ki cell, which is the only column this layout reads. */
function kiCell(target: number | null, actual: number | null, symbol: string | null): SheetCell {
  return {
    key: "KI",
    kind: "KI",
    label: "Ki Total",
    period: null,
    quarter: null,
    target,
    targetVersionCode: null,
    targetFormula: null,
    targetEditable: false,
    actual,
    achievement: null,
    gap: null,
    gapSense: "NEUTRAL",
    symbol,
    symbolLabel: symbol ? "Band" : null,
    symbolColor: symbol ? "#2C5F3F" : null,
    error: null,
    locked: false,
  } as SheetCell;
}

function item(
  id: string,
  level: number,
  path: string[],
  overrides: Partial<ControlItemRow> = {},
): SheetRowModel {
  return {
    id,
    kind: "CONTROL_ITEM",
    code: id.toUpperCase(),
    name: `Statement ${id}`,
    /*
     * Its own Objective's node id, which is deliberately NOT read off the
     * path: a row's path holds the ancestors *above* its Objective, so an
     * inline Level 2 measure has path ["goal"] and an objectiveId of its own.
     * Deriving it from the path made the measure claim the Goal's id, and
     * every Level 3 beneath it then found no parent at all.
     */
    objectiveId: id,
    firstOfObjective: true,
    objectiveItemCount: 1,
    measuredAs: "Units",
    unit: "COUNT",
    decimalPlaces: 0,
    direction: "HIGHER_BETTER",
    aggregation: "SUM",
    dicCode: "AUTO",
    dicName: "Auto",
    dicOrgUnitId: "org-auto",
    businessUnitCode: "AUTO",
    businessUnitName: "Automobiles",
    businessUnitId: "bu1",
    measuredAsRaw: "Units",
    responsibleUserId: null,
    responsibleUserName: null,
    level,
    path,
    laddersTo: null,
    cells: [kiCell(100, 90, "〇")],
    kiSymbol: "〇",
    ...overrides,
  } as SheetRowModel;
}

describe("which side a measure lands on", () => {
  it("puts the Level 2 measure left and the Level 3 it deploys into right", () => {
    const rows = [
      group("goal", 1, [], { ordinal: 1 } as Partial<GroupRow>),
      item("l2", 2, ["goal"]),
      item("l3", 3, ["goal", "l2"]),
    ];

    const [goal] = buildLandscape(rows);
    expect(goal.statement).toBe("Statement goal");
    expect(goal.objectives).toHaveLength(1);
    expect(goal.objectives[0].left.map((m) => m.id)).toEqual(["l2"]);
    expect(goal.objectives[0].right.map((m) => m.id)).toEqual(["l3"]);
  });

  /*
   * The trap. A heading's children are its own Control Items *and* what
   * deploys from it, in one list.
   */
  it("does not mistake a deployed Level 3 for one of the Level 2's own measures", () => {
    const rows = [
      group("goal", 1, []),
      group("l2", 2, ["goal"], { controlItemIds: ["a", "b"] } as Partial<GroupRow>),
      item("a", 2, ["goal", "l2"], { objectiveId: "l2", objectiveItemCount: 2 }),
      item("b", 2, ["goal", "l2"], { objectiveId: "l2", objectiveItemCount: 2, firstOfObjective: false }),
      item("c", 3, ["goal", "l2"]),
    ];

    const [goal] = buildLandscape(rows);
    expect(goal.objectives[0].left.map((m) => m.id)).toEqual(["a", "b"]);
    expect(goal.objectives[0].right.map((m) => m.id)).toEqual(["c"]);
  });

  it("reads the Ki column by kind, not by position", () => {
    // A reader narrowed to one quarter has a different column array; an index
    // would then take a quarter figure for the year's.
    const shuffled = item("l2", 2, ["goal"], {
      cells: [
        { ...kiCell(1, 2, "▲"), key: "Q1", kind: "QUARTER", label: "Q1" } as SheetCell,
        kiCell(4560, 4310, "〇"),
      ],
    });
    const [goal] = buildLandscape([group("goal", 1, []), shuffled]);
    expect(goal.objectives[0].left[0].target).toBe(4560);
    expect(goal.objectives[0].left[0].actual).toBe(4310);
    expect(goal.objectives[0].left[0].symbol).toBe("〇");
  });
});

describe("how tall a block is", () => {
  it("is one row for one measure with nothing deployed from it", () => {
    const [goal] = buildLandscape([group("goal", 1, []), item("l2", 2, ["goal"])]);
    expect(goal.objectives[0].rows).toBe(1);
    expect(goal.rows).toBe(1);
  });

  it("takes its height from the taller side", () => {
    const rows = [
      group("goal", 1, []),
      item("l2", 2, ["goal"]),
      group("l3a", 3, ["goal", "l2"], { controlItemIds: ["x", "y"] } as Partial<GroupRow>),
      item("x", 3, ["goal", "l2", "l3a"], { objectiveId: "l3a", objectiveItemCount: 2 }),
      item("y", 3, ["goal", "l2", "l3a"], { objectiveId: "l3a", objectiveItemCount: 2, firstOfObjective: false }),
    ];

    const [goal] = buildLandscape(rows);
    // One measure on the left, two on the right, so two printed rows.
    expect(goal.objectives[0].left).toHaveLength(1);
    expect(goal.objectives[0].right).toHaveLength(2);
    expect(goal.objectives[0].rows).toBe(2);
  });

  it("reports the rows a Goal's heading stands over", () => {
    const rows = [
      group("goal", 1, []),
      item("one", 2, ["goal"]),
      item("two", 2, ["goal"]),
      item("three", 2, ["goal"]),
    ];
    const [goal] = buildLandscape(rows);
    expect(goal.objectives).toHaveLength(3);
    expect(goal.rows).toBe(3);
  });
});

describe("what it refuses to draw", () => {
  it("drops Level 4, so a sheet with departments folded in still prints the company", () => {
    const rows = [
      group("goal", 1, []),
      item("l2", 2, ["goal"]),
      group("l3", 3, ["goal", "l2"], { controlItemIds: ["c"] } as Partial<GroupRow>),
      item("c", 3, ["goal", "l2", "l3"], { objectiveId: "l3" }),
      group("l4", 4, ["goal", "l2", "l3"], { orgUnitId: "org-auto" } as Partial<GroupRow>),
      item("dept", 4, ["goal", "l2", "l3", "l4"], { objectiveId: "l4" }),
    ];

    const [goal] = buildLandscape(rows);
    const printed = goal.objectives.flatMap((o) => [...o.left, ...o.right]).map((m) => m.id);
    expect(printed).toContain("l2");
    expect(printed).toContain("c");
    expect(printed).not.toContain("dept");
  });

  it("leaves out a Goal nothing hangs off, rather than printing an empty band", () => {
    expect(buildLandscape([group("lonely", 1, [])])).toEqual([]);
  });

  it("still prints an Objective with nothing measured against it", () => {
    // A policy agreed before its metric was. The cascade treats this gap as
    // the point of the page and so does this.
    const [goal] = buildLandscape([group("goal", 1, []), group("l2", 2, ["goal"])]);
    expect(goal.objectives[0].left).toHaveLength(1);
    expect(goal.objectives[0].left[0].unmeasured).toBe(true);
    expect(goal.objectives[0].left[0].statement).toBe("Statement l2");
    expect(goal.objectives[0].rows).toBe(1);
  });
});

describe("how many slides it takes", () => {
  const goalOf = (count: number) => {
    const rows: SheetRowModel[] = [group("goal", 1, [])];
    for (let index = 0; index < count; index++) rows.push(item(`l2-${index}`, 2, ["goal"]));
    return buildLandscape(rows);
  };

  /*
   * The Goal's heading is a row on the page like any other, so it counts. It
   * would be easy to leave it out and under-report by one per Goal, which
   * would quietly promise a slide that does not fit.
   */
  it("counts the Goal's heading row, not only its measures", () => {
    const fit = landscapeFit(goalOf(3));
    expect(fit.rows).toBe(4);
    expect(fit.measures).toBe(3);
  });

  it("is one slide while the rows fit", () => {
    // One objective short of the limit, because the heading takes the last row.
    const fit = landscapeFit(goalOf(ROWS_PER_SLIDE - 1));
    expect(fit.rows).toBe(ROWS_PER_SLIDE);
    expect(fit.slides).toBe(1);
  });

  it("is two the moment they do not", () => {
    expect(landscapeFit(goalOf(ROWS_PER_SLIDE)).rows).toBe(ROWS_PER_SLIDE + 1);
    expect(landscapeFit(goalOf(ROWS_PER_SLIDE)).slides).toBe(2);
  });

  it("is no slides at all for an empty plan, rather than one blank one", () => {
    expect(landscapeFit([])).toMatchObject({ rows: 0, slides: 0, measures: 0 });
  });

  /*
   * The count the page exists to surface. An unmeasured Objective occupies a
   * row but is not a measure, and the deployed count is the right-hand
   * column's entire content - on a real plan it is a small number, and the
   * reader should be able to see that at a glance.
   */
  it("counts measures and deployments apart from rows", () => {
    const rows = [
      group("goal", 1, []),
      item("l2", 2, ["goal"]),
      item("l3", 3, ["goal", "l2"]),
      group("bare", 2, ["goal"]),
    ];
    expect(landscapeFit(buildLandscape(rows))).toMatchObject({
      // Two Objective rows plus the one Goal heading above them.
      rows: 3,
      measures: 2,
      deployed: 1,
    });
  });
});

describe("row spans, which are the relationship being drawn", () => {
  /*
   * The defect this exists to catch. Four Level 3 Objectives under one Level 2
   * made a four-row block, and without a span the Level 2 printed in the first
   * row with three blank ones beneath it - reading as one Objective and three
   * empty ones rather than as one Objective deploying into four.
   */
  it("spans a lone Level 2 over every row its deployments occupy", () => {
    const rows: SheetRowModel[] = [group("goal", 1, []), item("l2", 2, ["goal"])];
    for (let index = 0; index < 4; index++) {
      rows.push(item(`l3-${index}`, 3, ["goal", "l2"]));
    }

    const [goal] = buildLandscape(rows);
    expect(goal.objectives[0].rows).toBe(4);
    expect(goal.objectives[0].leftSpan).toBe(4);
    // Four separate measures on the right, so each gets its own row.
    expect(goal.objectives[0].rightSpan).toBe(1);
  });

  it("spans a lone deployment over a Level 2 held to several measures", () => {
    const rows = [
      group("goal", 1, []),
      group("l2", 2, ["goal"], { controlItemIds: ["a", "b"] } as Partial<GroupRow>),
      item("a", 2, ["goal", "l2"], { objectiveId: "l2", objectiveItemCount: 2 }),
      item("b", 2, ["goal", "l2"], { objectiveId: "l2", objectiveItemCount: 2, firstOfObjective: false }),
      item("c", 3, ["goal", "l2"]),
    ];

    const [goal] = buildLandscape(rows);
    expect(goal.objectives[0].rows).toBe(2);
    expect(goal.objectives[0].leftSpan).toBe(1);
    expect(goal.objectives[0].rightSpan).toBe(2);
  });

  it("spans neither side when the block is one row", () => {
    const [goal] = buildLandscape([group("goal", 1, []), item("l2", 2, ["goal"])]);
    expect(goal.objectives[0]).toMatchObject({ rows: 1, leftSpan: 1, rightSpan: 1 });
  });

  /*
   * Every cell of a spanned group must carry the same span, or the table
   * reflows and the columns stop lining up. The component reads one number for
   * the whole side, so the invariant worth holding here is that the spans never
   * exceed the block.
   */
  it("never spans further than the block is tall", () => {
    const rows = [
      group("goal", 1, []),
      item("l2", 2, ["goal"]),
      item("l3a", 3, ["goal", "l2"]),
      item("l3b", 3, ["goal", "l2"]),
    ];
    const [goal] = buildLandscape(rows);
    for (const objective of goal.objectives) {
      expect(objective.leftSpan).toBeLessThanOrEqual(objective.rows);
      expect(objective.rightSpan).toBeLessThanOrEqual(objective.rows);
    }
  });
});
