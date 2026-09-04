/**
 * What an uploaded workbook is allowed to do.
 *
 * Every case here is a way a bulk path could quietly change something nobody
 * asked it to: a stale column re-filing a measure onto another division, a
 * typo in a code becoming a new measure, a trimmed sheet reading as a
 * deletion, a derived quarter being written into.
 */

import { describe, expect, it } from "vitest";
import {
  buildImportPlan,
  type PlanDefinitionRow,
  type PlanRow,
  type Snapshot,
} from "@/lib/import/plan";

const TARGET_VERSION = "v-prb";
const ACTUAL_VERSION = "v-act";

const snapshot: Snapshot = {
  months: ["2026-04", "2026-05", "2026-06"],
  dicCodes: ["AUTO", "AUTO-PRD", "OX"],
  businessUnitCodes: ["AUTO", "MC", "SHARED"],
  nodes: [
    { id: "goal", kind: "GOAL", level: 1, statement: "Profit and Growth", path: [] },
    {
      id: "deliveries",
      kind: "OBJECTIVE",
      level: 2,
      statement: "New vehicle deliveries",
      path: ["goal"],
    },
  ],
  items: [
    {
      id: "item-1",
      code: "AU-VOL",
      measuredAs: "Units delivered",
      nodeId: "deliveries",
      level: 2,
      dicCode: "AUTO",
      unit: "COUNT",
      aggregation: "SUM",
      direction: "HIGHER_BETTER",
      values: { [TARGET_VERSION]: { "2026-04": 4560 } },
      definition: "Retail units invoiced, net of cancellations.",
      latestRationale: "Last year 4,100. Capacity model gives 4,700 with the July line.",
    },
  ],
};

function row(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    row: 2,
    code: "AU-VOL",
    period: "2026-04",
    target: 5000,
    actual: null,
    goal: "Profit and Growth",
    // Blank on a Level 2 row: its parent is the Goal itself.
    parentObjective: "",
    objective: "New vehicle deliveries",
    controlItem: "Units delivered",
    dic: "AUTO",
    businessUnit: "AUTO",
    level: 2,
    unit: "COUNT",
    decimals: 0,
    aggregation: "SUM",
    direction: "HIGHER_BETTER",
    ...overrides,
  };
}

const plan = (rows: PlanRow[], allowCreate = false, definitions: PlanDefinitionRow[] = []) =>
  buildImportPlan(
    rows,
    snapshot,
    { targetVersionId: TARGET_VERSION, actualVersionId: ACTUAL_VERSION, allowCreate },
    definitions,
  );

/** A row of the Definitions sheet, defaulting to one that changes nothing. */
function definitionRow(overrides: Partial<PlanDefinitionRow> = {}): PlanDefinitionRow {
  return { row: 2, code: "AU-VOL", definition: "", rationale: "", ...overrides };
}

describe("writing figures against a measure that exists", () => {
  it("writes a target to the version the form chose", () => {
    const result = plan([row()]);
    expect(result.figures).toEqual([
      {
        row: 2,
        controlItemId: "item-1",
        measureKey: null,
        period: "2026-04",
        kind: "TARGET",
        input: 5000,
      },
    ]);
    expect(result.refusals).toHaveLength(0);
  });

  it("writes a target and an actual from one row", () => {
    const result = plan([row({ actual: 4310 })]);
    expect(result.figures.map((figure) => figure.kind)).toEqual(["TARGET", "ACTUAL"]);
  });

  it("counts a value that already matches rather than rewriting it", () => {
    // Re-uploading last month's file must not fill the audit trail with
    // hundreds of writes that changed nothing.
    const result = plan([row({ target: 4560 })]);
    expect(result.figures).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it("keeps a formula as a formula", () => {
    const result = plan([row({ target: "=[CI:AU-VOL][2026-04][OB] * 1.05" })]);
    expect(result.figures[0].input).toBe("=[CI:AU-VOL][2026-04][OB] * 1.05");
  });

  it("treats an empty cell as nothing to say, never as a deletion", () => {
    // A trimmed sheet must not erase a year. Clearing a figure is a deliberate
    // act and belongs where somebody can see the cell they are emptying.
    const result = plan([row({ target: null, actual: null })]);
    expect(result.figures).toHaveLength(0);
    expect(result.refusals).toHaveLength(0);
  });

  it("refuses a month outside the Ki", () => {
    const result = plan([row({ period: "2025-12" })]);
    expect(result.figures).toHaveLength(0);
    expect(result.refusals[0].reason).toBe("OUTSIDE_KI");
  });
});

describe("never moves, never renames", () => {
  it("refuses a row whose Parent objective column moved the measure", () => {
    const result = plan([row({ parentObjective: "Some other objective" })]);
    expect(result.figures).toHaveLength(0);
    expect(result.refusals[0].reason).toBe("WOULD_MOVE");
    expect(result.refusals[0].detail).toContain("its Goal");
  });

  it("treats a changed Objective statement as a rename: noted, never applied", () => {
    // The statement is the row's own name now, so a difference there is not a
    // move. Renaming is one deliberate edit on the sheet, not a side effect of
    // uploading a year of figures - and the figures still land.
    const result = plan([row({ objective: "Deliveries, new vehicles" })]);
    expect(result.refusals).toHaveLength(0);
    expect(result.figures).toHaveLength(1);
    expect(result.notes[0].note).toContain("Objective");
    expect(result.notes[0].note).toContain("Left as it is.");
  });

  it("refuses a row whose Department column moved the measure", () => {
    const result = plan([row({ dic: "OX" })]);
    expect(result.refusals[0].reason).toBe("WOULD_MOVE");
    // And it does not quietly create an OX copy instead.
    expect(result.measures).toHaveLength(0);
  });

  it("leaves a differing unit or roll-up alone, and says so", () => {
    const result = plan([row({ unit: "PERCENT", aggregation: "AVERAGE" })]);
    expect(result.figures).toHaveLength(1);
    expect(result.notes.map((note) => note.note.split(" ")[0])).toEqual(["Unit", "Roll-up"]);
  });

  it("compares statements as somebody reads them", () => {
    // Trailing space and case are neither a move nor a rename.
    const result = plan([row({ objective: "  new VEHICLE deliveries ", dic: "auto" })]);
    expect(result.refusals).toHaveLength(0);
    expect(result.notes).toHaveLength(0);
    expect(result.figures).toHaveLength(1);
  });
});

describe("creating what is not there", () => {
  const newRow = row({
    row: 9,
    code: "AU-NEW",
    objective: "Test drives booked",
    controlItem: "Bookings",
    parentObjective: "New vehicle deliveries",
  });

  it("refuses an unknown code when creation is off", () => {
    const result = plan([newRow]);
    expect(result.measures).toHaveLength(0);
    expect(result.figures).toHaveLength(0);
    expect(result.refusals[0].reason).toBe("UNKNOWN_CODE");
  });

  it("deploys the measure from an Objective that already exists", () => {
    const result = plan([newRow], true);
    expect(result.nodes).toHaveLength(0);
    expect(result.measures).toHaveLength(1);
    expect(result.measures[0]).toMatchObject({
      name: "Test drives booked",
      parentKey: "deliveries",
      code: "AU-NEW",
      dicCode: "AUTO",
    });
    expect(result.figures[0].measureKey).toBe(result.measures[0].key);
    expect(result.figures[0].controlItemId).toBeNull();
  });

  it("hangs a measure with no parent objective off the Goal itself", () => {
    // Which is where a Level 2 Objective sits, and the export writes the
    // column blank for exactly those rows.
    const result = plan([row({ code: "AU-L2", objective: "Brand consideration" })], true);
    expect(result.nodes).toHaveLength(0);
    expect(result.measures[0].parentKey).toBe("goal");
  });

  it("creates a measure once for all twelve of its months", () => {
    const months = snapshot.months.map((period, index) =>
      row({
        row: 10 + index,
        code: "AU-NEW",
        period,
        objective: "Test drives booked",
        controlItem: "Bookings",
      }),
    );
    const result = plan(months, true);
    expect(result.measures).toHaveLength(1);
    expect(result.figures).toHaveLength(3);
  });

  it("creates the Goal and the parent Objective above it when they are missing", () => {
    const result = plan(
      [
        row({
          code: "NEW-1",
          goal: "A brand new goal",
          parentObjective: "A brand new objective",
          objective: "A brand new measure",
        }),
      ],
      true,
    );
    expect(result.nodes.map((node) => node.kind)).toEqual(["GOAL", "OBJECTIVE"]);
    // Each hangs off the one above it, so the apply can create them in order.
    expect(result.nodes[1].parentKey).toBe(result.nodes[0].key);
    expect(result.measures[0].parentKey).toBe(result.nodes[1].key);
  });

  it("reuses a Goal that exists and creates only the Objective below it", () => {
    const result = plan(
      [row({ code: "NEW-2", parentObjective: "A new objective", objective: "M" })],
      true,
    );
    expect(result.nodes.map((node) => node.kind)).toEqual(["OBJECTIVE"]);
    expect(result.nodes[0].parentKey).toBe("goal");
  });

  it("ignores the number a Goal is printed with", () => {
    // The export writes "1.  Profit and Growth"; the Goal is still that Goal.
    const result = plan(
      [row({ code: "NEW-3", goal: "1.  Profit and Growth", objective: "M" })],
      true,
    );
    expect(result.nodes.filter((node) => node.kind === "GOAL")).toHaveLength(0);
  });

  it("refuses a new row that does not say where it belongs", () => {
    const result = plan([row({ code: "NEW-4", objective: "" })], true);
    expect(result.refusals[0].reason).toBe("INCOMPLETE_NEW_ROW");
  });

  it("refuses a new row filed against a department that does not exist", () => {
    const result = plan([row({ code: "NEW-5", objective: "M", dic: "NOPE" })], true);
    expect(result.refusals[0].reason).toBe("UNKNOWN_DIC");
  });

  it("refuses a new row with a business unit that does not exist", () => {
    const result = plan([row({ code: "NEW-6", objective: "M", businessUnit: "NOPE" })], true);
    expect(result.refusals[0].reason).toBe("UNKNOWN_BUSINESS_UNIT");
  });

  it("sends a new Level 4 row to the sheet instead of guessing", () => {
    // A department branch carries an org unit and ladders into an Objective
    // above it, and the file states neither.
    const result = plan([row({ code: "NEW-7", level: 4, objective: "M" })], true);
    expect(result.refusals[0].reason).toBe("LEVEL_4_NEEDS_THE_SHEET");
    expect(result.measures).toHaveLength(0);
  });
});

describe("settings on a new measure", () => {
  it("reads the words the export writes", () => {
    const result = plan(
      [
        row({
          code: "NEW-8",
          objective: "Cost per lead",
          unit: "CURRENCY",
          aggregation: "AVERAGE",
          direction: "Lower is better",
          decimals: 2,
        }),
      ],
      true,
    );
    expect(result.measures[0]).toMatchObject({
      unit: "CURRENCY",
      aggregation: "AVERAGE",
      direction: "LOWER_BETTER",
      decimalPlaces: 2,
    });
  });

  it("refuses a unit it does not know rather than defaulting", () => {
    // A percent measure created as a summed count reads wrong for a year.
    const result = plan([row({ code: "NEW-9", objective: "M", unit: "furlongs" })], true);
    expect(result.refusals[0].reason).toBe("UNKNOWN_SETTING");
    expect(result.measures).toHaveLength(0);
  });
});

describe("the Definitions sheet", () => {
  it("records a definition that differs from what is stored", () => {
    const result = plan(
      [],
      false,
      [definitionRow({ definition: "Retail units delivered, including fleet." })],
    );
    expect(result.definitions).toEqual([
      {
        row: 2,
        controlItemId: "item-1",
        measureKey: null,
        body: "Retail units delivered, including fleet.",
      },
    ]);
  });

  /*
   * The rule the whole feature rests on. The way a template is actually used
   * is download, fill in a few, upload, notice one more, upload again - so a
   * second application of the same file has to be a no-op rather than a
   * duplicate record of the same reasoning.
   */
  it("writes nothing when the definition is the one already stored", () => {
    const result = plan(
      [],
      false,
      [definitionRow({ definition: "Retail units invoiced, net of cancellations." })],
    );
    expect(result.definitions).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it("does not treat a reflowed paragraph as a revision", () => {
    // Excel hands back what somebody's wrapping did to it. Compared the way
    // statements are compared: trimmed, lowercased, whitespace collapsed.
    const result = plan(
      [],
      false,
      [definitionRow({ definition: "  Retail units invoiced,\n  net of cancellations. " })],
    );
    expect(result.definitions).toHaveLength(0);
  });

  it("adds a rationale rather than replacing the one recorded", () => {
    const result = plan([], false, [definitionRow({ rationale: "Line 2 slipped to October." })]);
    expect(result.rationales).toEqual([
      { row: 2, controlItemId: "item-1", measureKey: null, body: "Line 2 slipped to October." },
    ]);
  });

  it("skips a rationale that is already the newest on this version, and says so", () => {
    const result = plan(
      [],
      false,
      [
        definitionRow({
          rationale: "Last year 4,100. Capacity model gives 4,700 with the July line.",
        }),
      ],
    );
    expect(result.rationales).toHaveLength(0);
    expect(result.notes[0].note).toContain("already the newest");
  });

  it("leaves an empty cell alone rather than clearing what is stored", () => {
    const result = plan([], false, [definitionRow()]);
    expect(result.definitions).toHaveLength(0);
    expect(result.rationales).toHaveLength(0);
    expect(result.notes).toHaveLength(0);
    expect(result.unchanged).toBe(0);
  });

  it("refuses a code no measure has, and never creates one from this sheet", () => {
    const result = plan([], true, [definitionRow({ code: "NOPE", definition: "Something." })]);
    expect(result.refusals[0]).toMatchObject({ code: "NOPE", reason: "UNKNOWN_CODE" });
    expect(result.definitions).toHaveLength(0);
    expect(result.measures).toHaveLength(0);
  });

  it("attaches a definition to a measure this same file is creating", () => {
    const result = plan(
      [row({ code: "NEW-1", objective: "Fresh measure", controlItem: "Units" })],
      true,
      [definitionRow({ row: 3, code: "NEW-1", definition: "Counted at despatch." })],
    );
    expect(result.definitions).toEqual([
      {
        row: 3,
        controlItemId: null,
        measureKey: result.measures[0].key,
        body: "Counted at despatch.",
      },
    ]);
  });

  it("takes the first of two rows disagreeing about one measure, and says so", () => {
    // Silently taking the last would make the answer depend on row order.
    const result = plan(
      [],
      false,
      [
        definitionRow({ row: 2, definition: "First wording." }),
        definitionRow({ row: 3, definition: "Second wording." }),
      ],
    );
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0].body).toBe("First wording.");
    expect(result.notes[0].note).toContain("already read further up");
  });
});
