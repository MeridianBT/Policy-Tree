/**
 * How a row sits in the outline: how far it is indented, and what it is
 * numbered.
 *
 * Indentation is driven by the row's **level**, not by how deep it happens to
 * sit in the tree. Those two differ: a Level 4 department branch hangs off
 * whichever Level 2 or Level 3 Objective it ladders into, so tree depth varies
 * between branches while the level does not. Indenting by depth left rows of
 * the same level sitting at different distances from the margin, which is
 * exactly what the eye uses to read a policy deployment sheet. Indenting by
 * level lines every Level 2 up on one vertical, every Level 3 on the next.
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
 * Objective that carries it, which puts it level with any Objective deployed
 * from that same Objective — where it belongs, since both are its children.
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
  return groupOrdinalPrefix(ordinal) + statement;
}

/**
 * The number alone, for the screens that render the statement as emphasis runs
 * rather than as a string and so cannot concatenate it. One definition of the
 * spacing, whichever way a caller assembles the line.
 */
export function groupOrdinalPrefix(ordinal?: number | null): string {
  return ordinal ? `${ordinal}.  ` : "";
}

// ------------------------------------------------------------- Cascade tree

/**
 * A real nested tree, rebuilt from the flat row list `loadSheet` returns.
 *
 * The sheet screens walk the flat list directly, indenting each row by its
 * level - that works for a single scrolling grid. The cascade view needs
 * actual DOM nesting instead, so a connecting line can run continuously down
 * one branch rather than being faked with repeated border segments at each
 * row. Reconstruction is exact: every row already carries its full ancestor
 * chain in `path`, so the immediate parent is simply the last id in it.
 */
export interface CascadeNode {
  row: SheetRowModel;
  children: CascadeNode[];
}

export function buildCascadeTree(rows: readonly SheetRowModel[]): CascadeNode[] {
  const byId = new Map<string, CascadeNode>();
  for (const row of rows) byId.set(row.id, { row, children: [] });

  const roots: CascadeNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parentId = row.path[row.path.length - 1];
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * Whether a Level 1-3 Objective has any Level 4 branch laddering into it. A
 * Level 4 branch always attaches as a direct child of the Objective it
 * ladders into (see `addDepartmentBranch`), so this never needs to look
 * further than one level down.
 */
export function hasDepartmentWork(node: CascadeNode): boolean {
  return node.children.some((child) => child.row.level === 4);
}
