/**
 * Where a dragged row lands, expressed as the sortOrder every one of its
 * siblings should carry afterwards.
 *
 * Two things make this worth its own pure module rather than a few lines
 * inside the server action.
 *
 * The first is that siblings are not always the same level. A Level 2
 * Objective can carry both Level 3 Themes continuing the company tree and
 * Level 4 department branches laddering into it, side by side under the same
 * parent. Reordering is offered "within their level", so a Level 3 Theme moves
 * among Level 3 Themes and the Level 4 branches sitting between them must not
 * be dragged along behind it. The way that is honoured here is by treating the
 * positions the same-level rows occupy as fixed slots: the rows at that level
 * are reshuffled into those slots, and every other sibling keeps the slot it
 * already had.
 *
 * The second is that this is also the validation. `beforeId` has to be a
 * sibling at the same level or nothing is written, which is what stops a
 * reorder from being used to move a row into a parent - or an org unit - its
 * author was never allowed to touch.
 */

export interface ReorderSibling {
  id: string;
  level: number;
}

export interface SortOrderUpdate {
  id: string;
  sortOrder: number;
}

export class ReorderError extends Error {}

/**
 * @param siblings every child of one parent, in their current order.
 * @param id the row being moved.
 * @param beforeId the same-level sibling it should land in front of, or null
 *   to land after the last row at its level.
 */
export function reorderWithinLevel(
  siblings: readonly ReorderSibling[],
  id: string,
  beforeId: string | null,
): SortOrderUpdate[] {
  const moved = siblings.find((sibling) => sibling.id === id);
  if (!moved) throw new ReorderError("That row is no longer where it was.");
  if (beforeId === id) throw new ReorderError("A row cannot be dropped onto itself.");

  const slots: number[] = [];
  siblings.forEach((sibling, index) => {
    if (sibling.level === moved.level) slots.push(index);
  });

  const atLevel = slots.map((index) => siblings[index]);
  const without = atLevel.filter((sibling) => sibling.id !== id);

  let at: number;
  if (beforeId === null) {
    at = without.length;
  } else {
    at = without.findIndex((sibling) => sibling.id === beforeId);
    if (at === -1) {
      throw new ReorderError("A row can only be moved among its own siblings at its own level.");
    }
  }

  const next = [...without.slice(0, at), moved, ...without.slice(at)];

  const occupants = [...siblings];
  slots.forEach((index, position) => {
    occupants[index] = next[position];
  });

  return occupants.map((sibling, index) => ({ id: sibling.id, sortOrder: index }));
}
