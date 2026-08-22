/**
 * How a row sits in the outline: how far it is indented, and what it is
 * numbered.
 *
 * Indentation is driven by the row's **level**, not by how deep it happens to
 * sit in the tree. Those two differ: a Level 3 Objective hangs off a Level 3
 * Theme which hangs off a Level 2 Objective, so tree depth varies between
 * branches while the level does not. Indenting by depth left rows of the same
 * level sitting at different distances from the margin, which is exactly what
 * the eye uses to read a policy deployment sheet. Indenting by level lines
 * every Level 2 up on one vertical, every Level 3 on the next.
 *
 * Theme and Objective share a level and therefore share an indent; they are
 * told apart by weight and tint instead.
 */

import type { SheetRowModel } from "@/lib/sheet/types";

/** Indent width for one outline step. */
export const INDENT_STEP_PX = 14;

/**
 * Left margin every row shares before its indent is applied.
 *
 * Group rows carry a disclosure caret and Control Item rows do not, so a
 * Control Item row reserves the same width with an empty spacer. Without it
 * the two would sit four pixels apart at the same step, which is exactly
 * enough to break the vertical the eye is following.
 */
export const OUTLINE_BASE_PX = 4;

/** Width reserved for the disclosure caret, matched by the row spacer. */
export const CARET_WIDTH_PX = 16;

/**
 * Steps in from the margin.
 *
 * A Level 1 Goal sits at the margin. A Control Item sits one step in from the
 * Objective that carries it, which puts it level with any sub-Theme of that
 * same Objective — where it belongs, since both are its children.
 */
export function indentSteps(row: Pick<SheetRowModel, "kind" | "level">): number {
  return row.kind === "CONTROL_ITEM" ? row.level : row.level - 1;
}

export function indentPx(
  row: Pick<SheetRowModel, "kind" | "level">,
  base = OUTLINE_BASE_PX,
): number {
  return base + indentSteps(row) * INDENT_STEP_PX;
}

/**
 * The heading a group row shows. Level 1 Goals are numbered, because the
 * company priorities are referred to by number in the review — "where are we
 * on two?" — and nothing below them is.
 */
export function groupHeading(statement: string, ordinal?: number | null): string {
  return ordinal ? `${ordinal}.  ${statement}` : statement;
}
