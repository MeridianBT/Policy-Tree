/**
 * The toolbar's search.
 *
 * The cases that matter are the ones where "find a row" and "filter rows" pull
 * in different directions. Searching a Control Item is an ordinary filter: keep
 * that row and the chain above it, so it can be read in context. Searching a
 * *statement* is a request for a branch - somebody typing a Goal wants what is
 * under it, and answering with the heading alone would be useless.
 *
 * The rest is what a search on a real plan runs into: emphasis markers in a
 * statement, a code pasted in from a report, and a search that has to narrow an
 * already filtered sheet rather than replace it.
 */

import { describe, expect, it } from "vitest";
import { matchRows, EMPTY_FILTERS, type SheetFilters } from "@/components/sheet/filters";
import type { ControlItemRow, GroupRow, SheetRowModel } from "@/lib/sheet/types";

function group(id: string, level: number, statement: string, path: string[]): SheetRowModel {
  return {
    id,
    kind: level === 1 ? "GOAL" : "OBJECTIVE",
    level,
    statement,
    path,
    controlItemIds: [],
  } as GroupRow as SheetRowModel;
}

function item(
  id: string,
  name: string,
  path: string[],
  overrides: Partial<ControlItemRow> = {},
): SheetRowModel {
  return {
    id,
    kind: "CONTROL_ITEM",
    objectiveId: `objective-${id}`,
    firstOfObjective: true,
    objectiveItemCount: 1,
    code: id.toUpperCase(),
    name,
    measuredAs: "Units delivered",
    unit: "COUNT",
    decimalPlaces: 0,
    direction: "HIGHER_BETTER",
    aggregation: "SUM",
    dicCode: "AUTO",
    dicName: "Automotive",
    dicOrgUnitId: "org-auto",
    businessUnitCode: "AUTO",
    businessUnitName: "Automobiles",
    businessUnitId: "bu-auto",
    measuredAsRaw: null,
    responsibleUserId: null,
    responsibleUserName: null,
    level: path.length,
    path,
    laddersTo: null,
    cells: [],
    kiSymbol: null,
    ...overrides,
  } as ControlItemRow as SheetRowModel;
}

const ROWS: SheetRowModel[] = [
  group("goal", 1, "Profit and Growth", []),
  group("volume", 2, "**Retail** volume", ["goal"]),
  item("au-vol", "New vehicle deliveries", ["goal", "volume"]),
  item("au-suv", "Medium SUV deliveries", ["goal", "volume"], { code: "AU-SUV" }),
  group("empty", 3, "Nothing measured here yet", ["goal", "volume"]),
  group("brand", 1, "Brand", []),
  item("bn-nps", "Service experience", ["goal-brand"], {
    dicCode: "OX",
    businessUnitCode: "MC",
    path: ["brand"],
    level: 2,
  }),
];

const ids = (rows: SheetRowModel[]) => rows.map((row) => row.id);
const search = (text: string, overrides: Partial<SheetFilters> = {}) =>
  matchRows(ROWS, { ...EMPTY_FILTERS, ...overrides, search: text });

describe("searching the sheet", () => {
  it("keeps every row when the box is empty", () => {
    expect(matchRows(ROWS, EMPTY_FILTERS)).toHaveLength(ROWS.length);
    expect(search("   ")).toHaveLength(ROWS.length);
  });

  it("finds a measure by name and keeps the chain above it", () => {
    // A row on its own says nothing about where it sits in the plan.
    expect(ids(search("medium suv"))).toEqual(["goal", "volume", "au-suv"]);
  });

  it("ignores case", () => {
    expect(ids(search("MEDIUM SUV"))).toEqual(ids(search("medium suv")));
  });

  it("finds a measure by its code, which is what people paste in", () => {
    expect(ids(search("au-suv"))).toEqual(["goal", "volume", "au-suv"]);
  });

  it("finds a measure by its department", () => {
    expect(ids(search("ox"))).toEqual(["brand", "bn-nps"]);
  });

  it("gives a matched statement its whole branch", () => {
    // "Show me this Objective" - the heading alone would be useless, and an
    // Objective with nothing measured under it yet is part of the answer.
    expect(ids(search("retail volume"))).toEqual([
      "goal",
      "volume",
      "au-vol",
      "au-suv",
      "empty",
    ]);
  });

  it("looks past emphasis markers in a statement", () => {
    // The statement is written "**Retail** volume"; nobody types the asterisks.
    expect(ids(search("retail"))).toContain("volume");
  });

  it("gives a matched Goal everything beneath it", () => {
    expect(ids(search("profit and growth"))).toEqual([
      "goal",
      "volume",
      "au-vol",
      "au-suv",
      "empty",
    ]);
  });

  it("keeps a statement that matches nothing out of the results entirely", () => {
    expect(search("nothing here matches this")).toHaveLength(0);
  });

  it("narrows an already filtered sheet rather than replacing the filter", () => {
    // Search and the pickers intersect, the same way the pickers intersect
    // with each other. "deliveries" matches two rows; only one is a motorcycle
    // measure, and neither is - so the answer is nothing.
    expect(search("deliveries", { businessUnits: ["MC"] })).toHaveLength(0);
    expect(ids(search("deliveries", { businessUnits: ["AUTO"] }))).toEqual([
      "goal",
      "volume",
      "au-vol",
      "au-suv",
    ]);
  });

  it("does not let a matched statement smuggle rows past the other filters", () => {
    // The Objective matches, but its measures are filed to AUTO, so a sheet
    // narrowed to motorcycles keeps only the heading chain - never the rows a
    // filter has already excluded.
    expect(ids(search("retail volume", { dics: ["OX"] }))).toEqual(["goal", "volume", "empty"]);
  });
});
