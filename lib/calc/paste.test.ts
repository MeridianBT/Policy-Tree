/**
 * Pasting a block of figures onto the grid.
 *
 * The cases that matter are the ones where a plausible implementation quietly
 * writes to the wrong cell: Excel's trailing newline clearing a row nobody
 * selected, and a block wider than the year wrapping onto the next measure.
 */

import { describe, expect, it } from "vitest";
import { isSingleCell, parseClipboardGrid, planPaste } from "@/components/sheet/paste";

const ROWS = ["m1", "m2", "m3"];
const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07"];

describe("parseClipboardGrid", () => {
  it("splits tabs into cells and newlines into rows", () => {
    expect(parseClipboardGrid("1\t2\n3\t4")).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("handles every line ending a spreadsheet might use", () => {
    expect(parseClipboardGrid("1\t2\r\n3\t4")).toEqual([["1", "2"], ["3", "4"]]);
    expect(parseClipboardGrid("1\r2")).toEqual([["1"], ["2"]]);
  });

  it("discards the trailing newline Excel appends", () => {
    // Without this the last row of every paste would be a row of empty
    // strings, which clears cells the reader never selected.
    expect(parseClipboardGrid("1\t2\n")).toEqual([["1", "2"]]);
    expect(parseClipboardGrid("1\n2\n\n")).toEqual([["1"], ["2"]]);
  });

  it("returns nothing for empty clipboard text", () => {
    expect(parseClipboardGrid("")).toEqual([]);
    expect(parseClipboardGrid("\n")).toEqual([]);
  });

  it("keeps a formula intact", () => {
    expect(parseClipboardGrid("=[2026-04] * 1.05")).toEqual([["=[2026-04] * 1.05"]]);
  });
});

describe("isSingleCell", () => {
  it("is true for one value, so the browser can paste it like typing", () => {
    expect(isSingleCell("4500")).toBe(true);
    expect(isSingleCell("4500\n")).toBe(true);
  });

  it("is false for anything with a second cell in it", () => {
    expect(isSingleCell("1\t2")).toBe(false);
    expect(isSingleCell("1\n2")).toBe(false);
  });
});

describe("planPaste", () => {
  const anchor = { rowId: "m1", period: "2026-04" };

  it("lays a block down and across from the anchor", () => {
    const plan = planPaste([["1", "2"], ["3", "4"]], anchor, ROWS, MONTHS);
    expect(plan.cells).toEqual([
      { rowId: "m1", period: "2026-04", raw: "1" },
      { rowId: "m1", period: "2026-05", raw: "2" },
      { rowId: "m2", period: "2026-04", raw: "3" },
      { rowId: "m2", period: "2026-05", raw: "4" },
    ]);
    expect(plan.dropped).toBe(0);
  });

  it("fills a single measure's year from a pasted column", () => {
    const plan = planPaste([["1"], ["2"], ["3"]], anchor, ROWS, MONTHS);
    expect(plan.cells.map((cell) => cell.rowId)).toEqual(["m1", "m2", "m3"]);
    expect(plan.cells.every((cell) => cell.period === "2026-04")).toBe(true);
  });

  it("drops what runs past the last month instead of wrapping", () => {
    // Wrapping would file a figure against a month nobody chose, on a measure
    // nobody selected, and look exactly like a successful paste.
    const wide = [["1", "2", "3", "4", "5", "6"]];
    const plan = planPaste(wide, anchor, ROWS, MONTHS);
    expect(plan.cells).toHaveLength(4);
    expect(plan.dropped).toBe(2);
    expect(plan.cells.every((cell) => cell.rowId === "m1")).toBe(true);
  });

  it("drops what runs past the last row", () => {
    const tall = [["1"], ["2"], ["3"], ["4"], ["5"]];
    const plan = planPaste(tall, anchor, ROWS, MONTHS);
    expect(plan.cells).toHaveLength(3);
    expect(plan.dropped).toBe(2);
  });

  it("starts where the cursor is, not at the top left", () => {
    const plan = planPaste([["9"]], { rowId: "m3", period: "2026-07" }, ROWS, MONTHS);
    expect(plan.cells).toEqual([{ rowId: "m3", period: "2026-07", raw: "9" }]);
  });

  it("trims each cell, so a spreadsheet's padding does not become input", () => {
    const plan = planPaste([[" 1 ", "\t2"]], anchor, ROWS, MONTHS);
    expect(plan.cells.map((cell) => cell.raw)).toEqual(["1", "2"]);
  });

  it("keeps an empty cell, which clears rather than skips", () => {
    // A blank in the middle of a pasted column means "there is no target for
    // this month", and honouring it is what makes a paste idempotent.
    const plan = planPaste([["1"], [""], ["3"]], anchor, ROWS, MONTHS);
    expect(plan.cells.map((cell) => cell.raw)).toEqual(["1", "", "3"]);
  });

  it("plans nothing when the anchor is not on the grid", () => {
    const plan = planPaste([["1"]], { rowId: "gone", period: "2026-04" }, ROWS, MONTHS);
    expect(plan).toEqual({ cells: [], dropped: 0 });
  });
});
