/**
 * Column geometry. Lives beside the calculation tests because the sheet's
 * shape is as much a contract as its arithmetic: the print sheet and the
 * screen grid both read it, and a change here moves both.
 */

import { describe, expect, it } from "vitest";
import { ALL_QUARTERS, columnClass, columnWidth, sheetColumns } from "@/components/sheet/columns";

describe("sheet columns", () => {
  it("lays out months, quarters and the Ki total in fiscal order", () => {
    expect(sheetColumns(2026).map((c) => c.label)).toEqual([
      "Apr", "May", "Jun", "Q1",
      "Jul", "Aug", "Sep", "Q2",
      "Oct", "Nov", "Dec", "Q3",
      "Jan", "Feb", "Mar", "Q4",
      "Ki Total",
    ]);
  });

  it("keys month columns by period so a cell lookup cannot drift", () => {
    const columns = sheetColumns(2026);
    expect(columns[0].key).toBe("2026-04");
    expect(columns.find((c) => c.label === "Jan")!.key).toBe("2027-01");
  });

  it("condensing a quarter removes its months and keeps the quarter", () => {
    const columns = sheetColumns(2026, { condensedQuarters: ["Q1"] });
    expect(columns.map((c) => c.label)).toEqual([
      "Q1",
      "Jul", "Aug", "Sep", "Q2",
      "Oct", "Nov", "Dec", "Q3",
      "Jan", "Feb", "Mar", "Q4",
      "Ki Total",
    ]);
    expect(columns.find((c) => c.key === "Q1")!.condensed).toBe(true);
    expect(columns.find((c) => c.key === "Q2")!.condensed).toBe(false);
  });

  it("condensing every quarter leaves four quarters and the Ki total", () => {
    const columns = sheetColumns(2026, { condensedQuarters: ALL_QUARTERS });
    expect(columns.map((c) => c.label)).toEqual(["Q1", "Q2", "Q3", "Q4", "Ki Total"]);
    expect(columns.every((c) => c.kind !== "MONTH")).toBe(true);
  });

  it("condenses quarters independently of one another", () => {
    const columns = sheetColumns(2026, { condensedQuarters: ["Q2", "Q4"] });
    expect(columns.map((c) => c.label)).toEqual([
      "Apr", "May", "Jun", "Q1",
      "Q2",
      "Oct", "Nov", "Dec", "Q3",
      "Q4",
      "Ki Total",
    ]);
  });

  it("never removes the Ki total", () => {
    for (const condensed of [[], ["Q1"], ALL_QUARTERS]) {
      const columns = sheetColumns(2026, { condensedQuarters: condensed as never });
      expect(columns[columns.length - 1].key).toBe("KI");
    }
  });

  it("condensing is a view concern and changes no column's identity", () => {
    const expanded = sheetColumns(2026);
    const condensed = sheetColumns(2026, { condensedQuarters: ["Q1"] });
    for (const column of condensed) {
      const original = expanded.find((c) => c.key === column.key)!;
      expect(column.kind).toBe(original.kind);
      expect(column.quarter).toBe(original.quarter);
      expect(column.label).toBe(original.label);
    }
  });

  it("tints a condensed quarter a step darker than an expanded one", () => {
    expect(columnClass("QUARTER", false)).toContain("bg-paper-band");
    expect(columnClass("QUARTER", true)).toContain("bg-paper-band-strong");
    expect(columnClass("MONTH")).toContain("bg-paper");
  });

  it("gives summary columns more room than months", () => {
    expect(columnWidth("KI")).toBeGreaterThan(columnWidth("QUARTER"));
    expect(columnWidth("QUARTER")).toBeGreaterThan(columnWidth("MONTH"));
  });
});
