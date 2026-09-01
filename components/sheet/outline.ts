/**
 * How a row sits in the outline: how far it is indented, and what it is
 * numbered.
 *
 * Indentation is driven by the row's **level**, and never by how deep it
 * happens to sit in the tree or in the emitted rows. A row of a given level
 * lands on one vertical wherever it appears, which is exactly what the eye
 * uses to read a policy deployment sheet. The case that makes the difference
 * visible is an Objective held to a single Control Item: it prints no heading,
 * so the figures sit on the statement's own row - and that row is the
 * Objective, indented as one.
 */

import { rowKey, type SheetRowModel } from "@/lib/sheet/types";

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
 * How a row is described to the indent rules: its kind, its level, and — for a
 * Control Item — whether it is the row carrying its Objective's statement.
 */
export type OutlineRow = { kind: SheetRowModel["kind"]; level: number; firstOfObjective?: boolean };

/**
 * Steps in from the margin.
 *
 * A Level 1 Goal sits at the margin. A Control Item printed under a heading
 * sits one step in from the Objective that carries it, which puts it level
 * with any Objective deployed from that same Objective — where it belongs,
 * since both are its children.
 *
 * An Objective with a single Control Item has no heading: the statement and
 * the figures share one row. That row *is* the Objective, so it indents like
 * one. Stepping it in as a Control Item would land every inline Level 2 on the
 * same vertical as the Level 3 headings beneath it, and the vertical is the
 * whole way the cascade is read.
 */
export function indentSteps(row: OutlineRow): number {
  if (row.kind !== "CONTROL_ITEM") return row.level - 1;
  return row.firstOfObjective ? row.level - 1 : row.level;
}

export function indentPx(row: OutlineRow, base = OUTLINE_BASE_PX): number {
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
  // Two maps, because a row's id is not unique across kinds - see `rowKey`.
  // Every row gets a node of its own, and `byNodeId` answers what a `path`
  // entry resolves to: the Node's heading, or the single Control Item row that
  // stands in for it when the Objective renders inline.
  const byKey = new Map<string, CascadeNode>();
  const byNodeId = new Map<string, CascadeNode>();
  for (const row of rows) {
    const node: CascadeNode = { row, children: [] };
    byKey.set(rowKey(row), node);
    // An Objective held to one Control Item has no heading - that row *is* the
    // Objective, so it is what a child's path resolves to. A heading wins
    // where both exist, which is why it is written second.
    if (row.kind === "CONTROL_ITEM" && row.firstOfObjective) {
      byNodeId.set(row.objectiveId, node);
    }
  }
  for (const row of rows) {
    if (row.kind === "CONTROL_ITEM") continue;
    byNodeId.set(row.id, byKey.get(rowKey(row))!);
  }

  const roots: CascadeNode[] = [];
  for (const row of rows) {
    const node = byKey.get(rowKey(row))!;
    const parentId = row.path[row.path.length - 1];
    const parent = parentId ? byNodeId.get(parentId) : undefined;
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
