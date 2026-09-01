/**
 * Outline geometry: indentation and numbering.
 *
 * The bug this guards against is subtle. Indenting by tree depth looks correct
 * on one branch and wrong on the next, because a Level 4 branch laddering into
 * a Level 3 Objective sits a node deeper than one laddering into a Level 2.
 * Rows of the same level must land on the same vertical, which is what a
 * reader uses to see the deployment structure at a glance.
 */

import { describe, expect, it } from "vitest";
import {
  INDENT_STEP_PX,
  OUTLINE_BASE_PX,
  groupHeading,
  indentPx,
  indentSteps,
} from "@/components/sheet/outline";

const objective = (level: number) => ({ kind: "OBJECTIVE" as const, level });
/** A Control Item printed under a heading, because its Objective carries more than one. */
const item = (level: number) => ({ kind: "CONTROL_ITEM" as const, level, firstOfObjective: false });
/** The single Control Item of an Objective, sharing the statement's own row. */
const inline = (level: number) => ({ kind: "CONTROL_ITEM" as const, level, firstOfObjective: true });

describe("indentation", () => {
  it("puts a Level 1 Goal at the margin", () => {
    expect(indentSteps({ kind: "GOAL", level: 1 })).toBe(0);
  });

  it("indents each level one step further than the one above", () => {
    expect(indentSteps(objective(2))).toBe(1);
    expect(indentSteps(objective(3))).toBe(2);
    expect(indentSteps(objective(4))).toBe(3);
  });

  it("lines up every row of the same level, whatever its tree depth", () => {
    // A Level 4 branch laddering into a Level 3 Objective sits one node
    // deeper than one laddering into a Level 2, and both are Level 4.
    expect(indentSteps(objective(4))).toBe(indentSteps(objective(4)));
    expect(indentSteps(item(4))).toBe(indentSteps(objective(4)) + 1);
  });

  it("sets a Control Item one step in from the Objective that carries it", () => {
    expect(indentSteps(item(2))).toBe(indentSteps(objective(2)) + 1);
    expect(indentSteps(item(3))).toBe(indentSteps(objective(3)) + 1);
  });

  it("lands a Control Item level with an Objective deployed from the same one", () => {
    // Both are children of a Level 2 Objective, so both belong on one vertical.
    expect(indentSteps(item(2))).toBe(indentSteps(objective(3)));
  });

  it("indents a lone Control Item as the Objective it is sharing a row with", () => {
    // One Control Item means no heading: statement and figures on one row. That
    // row is the Objective, so it sits on the Objective's vertical - not a step
    // in, which would put every inline Level 2 level with the Level 3 headings
    // laddering off it and flatten the cascade the eye is reading.
    expect(indentSteps(inline(2))).toBe(indentSteps(objective(2)));
    expect(indentSteps(inline(3))).toBe(indentSteps(objective(3)));
    expect(indentSteps(inline(4))).toBe(indentSteps(objective(4)));
    expect(indentSteps(inline(2))).toBeLessThan(indentSteps(objective(3)));
  });

  it("converts steps to pixels against a fixed step and a shared base", () => {
    expect(indentPx(objective(2))).toBe(OUTLINE_BASE_PX + INDENT_STEP_PX);
    expect(indentPx(objective(3))).toBe(OUTLINE_BASE_PX + 2 * INDENT_STEP_PX);
  });

  it("gives a group row and a Control Item at the same step the same offset", () => {
    // The Control Item reserves the caret width with a spacer, so equal steps
    // really do land on one vertical rather than four pixels apart.
    expect(indentPx(item(2))).toBe(indentPx(objective(3)));
  });
});

describe("numbering", () => {
  it("numbers a Level 1 Goal", () => {
    expect(groupHeading("Grow profitable revenue", 2)).toBe("2.  Grow profitable revenue");
  });

  it("leaves everything below Level 1 unnumbered", () => {
    expect(groupHeading("Volume and mix")).toBe("Volume and mix");
    expect(groupHeading("Volume and mix", null)).toBe("Volume and mix");
  });

  it("does not number from zero", () => {
    expect(groupHeading("Something", 0)).toBe("Something");
  });
});
