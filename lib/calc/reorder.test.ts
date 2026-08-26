/**
 * Dragging a row among its siblings.
 *
 * The case that matters most is the mixed-level one. A Level 2 Objective can
 * carry Level 3 Themes continuing the company tree and Level 4 department
 * branches laddering into it, as siblings under one parent. Reordering is
 * offered "within their level", so moving a Theme must leave every department
 * branch exactly where it was - a department's work is not the company
 * planner's to shuffle, and a renumber that dragged it along would do so
 * silently.
 */

import { describe, expect, it } from "vitest";
import { ReorderError, reorderWithinLevel } from "@/lib/structure/reorder";

const sib = (id: string, level: number) => ({ id, level });

/** The resulting order, read back as ids, which is what the sheet will show. */
function orderOf(
  siblings: ReadonlyArray<{ id: string; level: number }>,
  id: string,
  beforeId: string | null,
): string[] {
  return reorderWithinLevel(siblings, id, beforeId)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((update) => update.id);
}

describe("reorderWithinLevel", () => {
  const flat = [sib("a", 2), sib("b", 2), sib("c", 2), sib("d", 2)];

  it("moves a row in front of the sibling it was dropped on", () => {
    expect(orderOf(flat, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a row to the end when nothing follows the drop", () => {
    expect(orderOf(flat, "a", null)).toEqual(["b", "c", "d", "a"]);
  });

  it("renumbers densely from zero, whatever the old numbers were", () => {
    const sparse = [sib("a", 2), sib("b", 2), sib("c", 2)];
    expect(reorderWithinLevel(sparse, "c", "a")).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("is a no-op when a row is dropped in front of the sibling already after it", () => {
    expect(orderOf(flat, "a", "b")).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves siblings at other levels on the slots they already held", () => {
    // L3 Theme, L4 branch, L3 Theme, L4 branch - as an Objective that has both
    // a company-level breakdown and departments laddering into it looks.
    const mixed = [sib("t1", 3), sib("dept1", 4), sib("t2", 3), sib("dept2", 4)];

    // The Level 3 Themes swap. The Level 4 branches keep positions 1 and 3.
    expect(orderOf(mixed, "t2", "t1")).toEqual(["t2", "dept1", "t1", "dept2"]);

    // And moving a Level 4 branch leaves the Themes on 0 and 2.
    expect(orderOf(mixed, "dept2", "dept1")).toEqual(["t1", "dept2", "t2", "dept1"]);
  });

  it("refuses a target at a different level", () => {
    const mixed = [sib("t1", 3), sib("dept1", 4)];
    expect(() => reorderWithinLevel(mixed, "t1", "dept1")).toThrow(ReorderError);
  });

  it("refuses a target that is not a sibling at all", () => {
    expect(() => reorderWithinLevel(flat, "a", "somewhere-else")).toThrow(ReorderError);
  });

  it("refuses a row that is no longer among its siblings", () => {
    // A stale sheet: someone else deleted the row between the drag and the drop.
    expect(() => reorderWithinLevel(flat, "gone", "b")).toThrow(ReorderError);
  });

  it("refuses a row dropped onto itself", () => {
    expect(() => reorderWithinLevel(flat, "b", "b")).toThrow(ReorderError);
  });

  it("handles a lone sibling without moving anything", () => {
    expect(orderOf([sib("only", 1)], "only", null)).toEqual(["only"]);
  });
});
