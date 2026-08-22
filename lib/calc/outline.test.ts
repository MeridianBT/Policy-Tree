/**
 * Outline geometry: indentation and numbering.
 *
 * The bug this guards against is subtle. Indenting by tree depth looks correct
 * on one branch and wrong on the next, because a Level 3 Objective sits four
 * nodes deep under one parent and three under another. Rows of the same level
 * must land on the same vertical, which is what a reader uses to see the
 * deployment structure at a glance.
 */

import { describe, expect, it } from "vitest";
import {
  INDENT_STEP_PX,
  OUTLINE_BASE_PX,
  groupHeading,
  indentPx,
  indentSteps,
} from "@/components/sheet/outline";

const group = (level: number) => ({ kind: "THEME" as const, level });
const objective = (level: number) => ({ kind: "OBJECTIVE" as const, level });
const item = (level: number) => ({ kind: "CONTROL_ITEM" as const, level });

describe("indentation", () => {
  it("puts a Level 1 Goal at the margin", () => {
    expect(indentSteps({ kind: "GOAL", level: 1 })).toBe(0);
  });

  it("indents each level one step further than the one above", () => {
    expect(indentSteps(group(2))).toBe(1);
    expect(indentSteps(group(3))).toBe(2);
    expect(indentSteps(group(4))).toBe(3);
  });

  it("lines up every row of the same level, whatever its tree depth", () => {
    // A Level 3 Objective reached through a Level 3 Theme, and one reached
    // directly, sit at different depths but the same level.
    expect(indentSteps(objective(3))).toBe(indentSteps(group(3)));
    expect(indentSteps(objective(2))).toBe(indentSteps(group(2)));
  });

  it("puts a Theme and an Objective of the same level on the same vertical", () => {
    expect(indentSteps(group(2))).toBe(indentSteps(objective(2)));
  });

  it("sets a Control Item one step in from the Objective that carries it", () => {
    expect(indentSteps(item(2))).toBe(indentSteps(objective(2)) + 1);
    expect(indentSteps(item(3))).toBe(indentSteps(objective(3)) + 1);
  });

  it("lands a Control Item level with a sub-Theme of the same Objective", () => {
    // Both are children of a Level 2 Objective, so both belong on one vertical.
    expect(indentSteps(item(2))).toBe(indentSteps(group(3)));
  });

  it("converts steps to pixels against a fixed step and a shared base", () => {
    expect(indentPx(group(2))).toBe(OUTLINE_BASE_PX + INDENT_STEP_PX);
    expect(indentPx(group(3))).toBe(OUTLINE_BASE_PX + 2 * INDENT_STEP_PX);
  });

  it("gives a group row and a Control Item at the same step the same offset", () => {
    // The Control Item reserves the caret width with a spacer, so equal steps
    // really do land on one vertical rather than four pixels apart.
    expect(indentPx(item(2))).toBe(indentPx(group(3)));
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
