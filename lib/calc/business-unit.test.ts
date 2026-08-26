/**
 * The business unit dimension.
 *
 * The rule this pins is the one stated as hard: no summing or roll-up across
 * business units. A car volume and a motorcycle volume are not addable, and
 * the whole-company view shows both rows rather than merging them.
 *
 * Structurally that rule is satisfied by the product never aggregating across
 * rows at all - each Control Item is measured on its own data, and there is no
 * weighted roll-up between levels either (see lib/calc/aggregate.ts, which
 * rolls a single measure up its own months, never two measures together). So
 * what is actually testable, and what these cover, is that the filter selects
 * rather than combines, and that an unfiltered sheet keeps every unit visible
 * side by side.
 */

import { describe, expect, it } from "vitest";
import { matchRows, EMPTY_FILTERS, type SheetFilters } from "@/components/sheet/filters";
import type { ControlItemRow, SheetRowModel } from "@/lib/sheet/types";

function item(id: string, businessUnitCode: string, dicCode = "SLS"): SheetRowModel {
  return {
    id,
    kind: "CONTROL_ITEM",
    code: id,
    name: `Item ${id}`,
    measuredAs: "Units",
    unit: "COUNT",
    decimalPlaces: 0,
    direction: "HIGHER_BETTER",
    aggregation: "SUM",
    dicCode,
    dicName: dicCode,
    dicOrgUnitId: dicCode,
    businessUnitCode,
    businessUnitName: businessUnitCode,
    responsibleUserName: null,
    level: 2,
    path: ["goal-1"],
    laddersTo: null,
    cells: [],
    kiSymbol: null,
  } as ControlItemRow;
}

const GOAL: SheetRowModel = {
  id: "goal-1",
  kind: "GOAL",
  level: 1,
  statement: "Profit and Growth",
  path: [],
  controlItemIds: [],
} as SheetRowModel;

const ROWS: SheetRowModel[] = [
  GOAL,
  item("auto-volume", "AUTO"),
  item("mc-volume", "MC"),
  item("pp-volume", "PP"),
  item("engagement", "SHARED", "PPL"),
];

const filters = (overrides: Partial<SheetFilters>): SheetFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

describe("business unit filter", () => {
  it("shows every unit's rows side by side when nothing is selected", () => {
    // The consolidated company view, and the reason no unit is named "all":
    // selecting none of the four is what shows everything. Four measures,
    // four rows - not one merged total.
    const kept = matchRows(ROWS, EMPTY_FILTERS);
    const codes = kept
      .filter((row) => row.kind === "CONTROL_ITEM")
      .map((row) => (row as ControlItemRow).businessUnitCode);
    expect(codes).toEqual(["AUTO", "MC", "PP", "SHARED"]);
  });

  it("selects one unit's measures and drops the rest", () => {
    const kept = matchRows(ROWS, filters({ businessUnits: ["MC"] }));
    const items = kept.filter((row) => row.kind === "CONTROL_ITEM");
    expect(items).toHaveLength(1);
    expect((items[0] as ControlItemRow).id).toBe("mc-volume");
  });

  it("keeps several units when several are selected, still unmerged", () => {
    const kept = matchRows(ROWS, filters({ businessUnits: ["MC", "PP"] }));
    const ids = kept
      .filter((row) => row.kind === "CONTROL_ITEM")
      .map((row) => (row as ControlItemRow).id);
    expect(ids).toEqual(["mc-volume", "pp-volume"]);
  });

  it("keeps the parent Goal so a filtered row is not orphaned", () => {
    const kept = matchRows(ROWS, filters({ businessUnits: ["MC"] }));
    expect(kept.some((row) => row.id === "goal-1")).toBe(true);
  });

  it("intersects with the DIC filter rather than replacing it", () => {
    // "Shared measures owned by People & Culture" - two independent tags
    // meeting, which is the point of keeping the business unit off the org
    // tree.
    expect(
      matchRows(ROWS, filters({ businessUnits: ["SHARED"], dics: ["PPL"] })).filter(
        (row) => row.kind === "CONTROL_ITEM",
      ),
    ).toHaveLength(1);

    // The same unit filed against a division that does not own it: no rows.
    expect(
      matchRows(ROWS, filters({ businessUnits: ["SHARED"], dics: ["SLS"] })).filter(
        (row) => row.kind === "CONTROL_ITEM",
      ),
    ).toHaveLength(0);
  });

  it("returns nothing for a unit that carries no measure", () => {
    const kept = matchRows([GOAL, item("a", "AUTO")], filters({ businessUnits: ["PP"] }));
    expect(kept.filter((row) => row.kind === "CONTROL_ITEM")).toHaveLength(0);
  });
});
