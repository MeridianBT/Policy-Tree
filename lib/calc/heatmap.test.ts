/**
 * The symbol heatmap's aggregation. What matters here is that it never
 * collapses a cell to one symbol - every band present that month stays
 * counted separately - and that a Department's Control Items land in their
 * parent Division's cell.
 */

import { describe, expect, it } from "vitest";
import { buildSymbolHeatmap, divisionCodes } from "@/lib/calc/heatmap";
import type { ControlItemRow, SheetModel, SheetRowModel } from "@/lib/sheet/types";
import type { SheetCell } from "@/lib/calc/row";

const DICS: SheetModel["dics"] = [
  { id: "auto", code: "AUTO", name: "Auto", type: "DIVISION", parentCode: null },
  { id: "ox", code: "OX", name: "OX", type: "DIVISION", parentCode: null },
  { id: "auto-sales", code: "AUTO-SALES", name: "Dealer Sales", type: "DEPARTMENT", parentCode: "AUTO" },
];

const MONTHS = ["2026-04", "2026-05"];

function monthCell(period: string, symbol: string | null): SheetCell {
  return {
    key: period,
    kind: "MONTH",
    label: period,
    period,
    quarter: null,
    target: 100,
    targetVersionCode: null,
    actual: 100,
    achievement: 1,
    gap: 0,
    gapSense: "FAVOURABLE",
    symbol,
    symbolLabel: symbol,
    symbolColor: null,
    error: null,
    locked: false,
  };
}

function item(id: string, dicCode: string, cells: SheetCell[]): SheetRowModel {
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
    responsibleUserName: null,
    level: 2,
    path: [],
    laddersTo: null,
    cells,
    kiSymbol: null,
  } as ControlItemRow;
}

describe("divisionCodes", () => {
  it("lists Divisions only, never Departments", () => {
    expect(divisionCodes(DICS)).toEqual(["AUTO", "OX"]);
  });
});

describe("buildSymbolHeatmap", () => {
  it("counts every symbol separately rather than collapsing to one", () => {
    const rows = [
      item("a", "AUTO", [monthCell("2026-04", "〇")]),
      item("b", "AUTO", [monthCell("2026-04", "■")]),
    ];
    const cells = buildSymbolHeatmap(rows, DICS, MONTHS);
    const april = cells.find((c) => c.divisionCode === "AUTO" && c.period === "2026-04")!;
    expect(april.counts).toEqual({ "〇": 1, "■": 1 });
    expect(april.total).toBe(2);
  });

  it("attributes a Department's items to its parent Division", () => {
    const rows = [item("a", "AUTO-SALES", [monthCell("2026-04", "▲")])];
    const cells = buildSymbolHeatmap(rows, DICS, MONTHS);
    const april = cells.find((c) => c.divisionCode === "AUTO" && c.period === "2026-04")!;
    expect(april.counts).toEqual({ "▲": 1 });
  });

  it("emits a zero cell for a month with nothing keyed, rather than omitting it", () => {
    // AUTO is in the plan — it carries a measure — but nothing is keyed for
    // May. That empty cell is meaningful and has to survive.
    const rows = [item("a", "AUTO", [monthCell("2026-04", "〇")])];
    const cells = buildSymbolHeatmap(rows, DICS, MONTHS);
    const may = cells.find((c) => c.divisionCode === "AUTO" && c.period === "2026-05")!;
    expect(may).toBeDefined();
    expect(may.total).toBe(0);
  });

  it("leaves out a Division that carries no measure in this plan at all", () => {
    // OX is a real division but nothing in this Ki is filed against it. A row
    // of empty cells would read as "nothing keyed yet"; the truth is "nothing
    // was ever planned here", which is a different thing and not the reader's
    // problem.
    const rows = [item("a", "AUTO", [monthCell("2026-04", "〇")])];
    const cells = buildSymbolHeatmap(rows, DICS, MONTHS);
    expect(cells.some((c) => c.divisionCode === "OX")).toBe(false);
    expect(divisionCodes(DICS, rows)).toEqual(["AUTO"]);
  });

  it("still lists every Division when no rows are supplied", () => {
    // The DIC picker and the add-measure form need the full list.
    expect(divisionCodes(DICS)).toEqual(["AUTO", "OX"]);
  });

  it("ignores a month cell with no symbol (no target/actual that month)", () => {
    const rows = [item("a", "AUTO", [monthCell("2026-04", null)])];
    const cells = buildSymbolHeatmap(rows, DICS, MONTHS);
    const april = cells.find((c) => c.divisionCode === "AUTO" && c.period === "2026-04")!;
    expect(april.total).toBe(0);
  });

  it("ignores Quarter and Ki cells, counting month cells only", () => {
    const rows = [
      item("a", "AUTO", [
        { ...monthCell("2026-04", "〇"), kind: "QUARTER" as const },
        { ...monthCell("2026-04", "■"), kind: "KI" as const },
      ]),
    ];
    const cells = buildSymbolHeatmap(rows, DICS, MONTHS);
    expect(cells.every((c) => c.total === 0)).toBe(true);
  });

  it("does not count a group row, only Control Items", () => {
    const rows: SheetRowModel[] = [
      {
        id: "g",
        kind: "GOAL",
        level: 1,
        statement: "Goal",
        path: [],
        controlItemIds: [],
      } as SheetRowModel,
    ];
    const cells = buildSymbolHeatmap(rows, DICS, MONTHS);
    expect(cells.every((c) => c.total === 0)).toBe(true);
  });
});
