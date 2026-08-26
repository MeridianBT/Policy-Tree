/**
 * What a keyable box shows, and when a blur is worth a round trip.
 *
 * The case worth the most here is the formula one. A cell holding
 * "=SUM([2026-04:2026-06])" evaluates to a number, and seeding the box with
 * that number would mean tabbing through the cell silently replaced the
 * formula with a frozen literal - a data-loss bug that would look like
 * nothing at all on screen.
 */

import { describe, expect, it } from "vitest";
import {
  cellKey,
  displayFor,
  isDirty,
  retireSaved,
  seedInput,
  type CellEditState,
} from "@/components/sheet/entry-state";

const literal = { target: 4500, targetFormula: null };
const formula = { target: 13500, targetFormula: "=SUM([2026-04:2026-06])" };
const empty = { target: null, targetFormula: null };

const state = (input: string, status: CellEditState["status"]): CellEditState => ({
  input,
  status,
  value: null,
  error: status === "ERROR" ? "Nope." : null,
});

describe("seedInput", () => {
  it("shows a formula as it was written, never what it evaluated to", () => {
    expect(seedInput(formula, 0)).toBe("=SUM([2026-04:2026-06])");
  });

  it("shows a literal plainly, at the row's own precision", () => {
    expect(seedInput(literal, 0)).toBe("4500");
    expect(seedInput(literal, 2)).toBe("4500.00");
  });

  it("does not group thousands - a box is for typing, not for reading", () => {
    // formatValue would render "4,500". Seeding that would be fine to read and
    // wrong to hand back, so the box gets the plain number.
    expect(seedInput({ target: 1234567, targetFormula: null }, 0)).toBe("1234567");
  });

  it("shows an unkeyed month as empty rather than as zero", () => {
    expect(seedInput(empty, 0)).toBe("");
  });
});

describe("displayFor", () => {
  it("prefers what this session typed over what the sheet last said", () => {
    expect(displayFor(literal, 0, state("5000", "SAVING"))).toBe("5000");
  });

  it("keeps a formula in the box after it saves, not its result", () => {
    expect(displayFor(formula, 0, state("=SUM([2026-04:2026-06])", "SAVED"))).toBe(
      "=SUM([2026-04:2026-06])",
    );
  });

  it("keeps the text that failed, so a correction starts from it", () => {
    expect(displayFor(literal, 0, state("45o0", "ERROR"))).toBe("45o0");
  });

  it("falls back to the sheet when nothing has been typed", () => {
    expect(displayFor(literal, 0, undefined)).toBe("4500");
  });
});

describe("isDirty", () => {
  it("is false for a blur that changed nothing", () => {
    // Tabbing across twelve months would otherwise write twelve identical
    // values and leave twelve edits in the audit trail.
    expect(isDirty(literal, 0, undefined, "4500")).toBe(false);
    expect(isDirty(literal, 0, undefined, "  4500 ")).toBe(false);
  });

  it("is false for a formula cell simply tabbed through", () => {
    // The formula is what the box was seeded with, so blurring it unchanged
    // must not rewrite the cell - which is the whole reason seedInput hands
    // back the formula rather than its result.
    expect(isDirty(formula, 0, undefined, "=SUM([2026-04:2026-06])")).toBe(false);
  });

  it("is true once the text differs", () => {
    expect(isDirty(literal, 0, undefined, "4600")).toBe(true);
  });

  it("is true when a literal is replaced by a formula", () => {
    expect(isDirty(literal, 0, undefined, "=[2026-04] * 1.05")).toBe(true);
  });

  it("is true when a box is emptied, which clears the cell", () => {
    expect(isDirty(literal, 0, undefined, "")).toBe(true);
  });

  it("is false when an emptied cell is blurred again", () => {
    expect(isDirty(empty, 0, undefined, "")).toBe(false);
  });

  it("does not re-fire a rejection that has not been corrected", () => {
    expect(isDirty(literal, 0, state("45o0", "ERROR"), "45o0")).toBe(false);
    expect(isDirty(literal, 0, state("45o0", "ERROR"), "4600")).toBe(true);
  });
});

describe("retireSaved", () => {
  it("drops saved stand-ins once the sheet has been re-read", () => {
    // Otherwise a figure someone else keyed would stay masked by this
    // session's own typing for as long as the tab stayed open.
    const cells = new Map([["a", state("1", "SAVED")], ["b", state("2", "SAVING")]]);
    const next = retireSaved(cells);
    expect([...next.keys()]).toEqual(["b"]);
  });

  it("keeps an error the reader has not dealt with yet", () => {
    const cells = new Map([["a", state("x", "ERROR")]]);
    expect(retireSaved(cells).size).toBe(1);
  });

  it("returns the same map when nothing retires, so a caller can bail out", () => {
    const cells = new Map([["a", state("x", "ERROR")]]);
    expect(retireSaved(cells)).toBe(cells);
    const none = new Map<string, CellEditState>();
    expect(retireSaved(none)).toBe(none);
  });
});

describe("cellKey", () => {
  it("addresses a cell by measure and month", () => {
    expect(cellKey("ci1", "2026-04")).toBe("ci1|2026-04");
    expect(cellKey("ci1", "2026-04")).not.toBe(cellKey("ci1", "2026-05"));
  });
});
