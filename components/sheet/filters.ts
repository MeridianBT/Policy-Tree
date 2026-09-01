/**
 * Which rows a set of filters keeps.
 *
 * Pure, and deliberately in its own module rather than inside SheetGrid: the
 * component file is .tsx and cannot be imported by the test runner, and this
 * is a rule worth testing directly - the same reason lib/auth/permissions.ts
 * and components/sheet/outline.ts sit apart from the components that use them.
 *
 * Three dimensions, in the order the toolbar offers them: business unit, then
 * Division, then Department. They intersect rather than replace one another,
 * so "motorcycle measures owned by Product Planning" is one selection in each.
 *
 * "Below target" joins them as a fourth, and intersects the same way - it is a
 * one-click preset rather than a fourth picker, but it filters here with the
 * rest so that clearing filters clears all of it and no screen has to remember
 * a second way of hiding rows.
 *
 * Search is the fifth and behaves a little differently from the others,
 * because of what people search a Hoshin sheet for. Matching a Control Item
 * keeps that row and the chain above it, like every other filter. But matching
 * a *statement* keeps everything beneath it too: somebody typing a Goal or an
 * Objective is asking "show me this branch", and answering with the heading
 * alone and nothing under it would be useless.
 */

import type { ControlItemRow, GroupRow, SheetRowModel } from "@/lib/sheet/types";
import { isBelowTarget } from "./below-target";
import { plainText } from "@/lib/text/emphasis";

export interface SheetFilters {
  /**
   * Business unit codes. Empty means every unit - the whole-company view,
   * which shows all rows together rather than merging them: a motorcycle
   * volume and a car volume sit on separate rows and are never added up.
   */
  businessUnits: string[];
  /** Division and Department codes, matched against the row's own DIC. */
  dics: string[];
  /**
   * Keep only measures behind as of their own last reported month. See
   * components/sheet/below-target.ts for why that month and not another.
   */
  belowTarget: boolean;
  /**
   * Free text, matched without case against a statement, a measure's name,
   * what it is measured as, its code and its department. Empty means no
   * search rather than "match nothing".
   */
  search: string;
}

export const EMPTY_FILTERS: SheetFilters = {
  businessUnits: [],
  dics: [],
  belowTarget: false,
  search: "",
};

/**
 * The text a row is searched by.
 *
 * Emphasis markers come off first: somebody searching for "retail volume"
 * should find a statement written "**retail** volume", and the asterisks are
 * formatting rather than something anyone would type. A Control Item carries
 * its code and department too, because "AU-VOL" and "AUTO-PRD" are exactly the
 * strings people paste in from a report.
 */
function searchable(row: SheetRowModel): string {
  if (row.kind === "CONTROL_ITEM") {
    const item = row as ControlItemRow;
    return [plainText(item.name), item.measuredAs, item.code, item.dicCode]
      .join(" ")
      .toLowerCase();
  }
  return plainText((row as GroupRow).statement).toLowerCase();
}

export function matchRows(rows: SheetRowModel[], filters: SheetFilters): SheetRowModel[] {
  const needle = filters.search.trim().toLowerCase();
  const noFilter =
    filters.businessUnits.length === 0 &&
    filters.dics.length === 0 &&
    !filters.belowTarget &&
    !needle;
  if (noFilter) return rows;

  // Statements whose text matches: their whole branch is what was asked for.
  const matchedGroups = new Set<string>();
  if (needle) {
    for (const row of rows) {
      if (row.kind === "CONTROL_ITEM") continue;
      if (searchable(row).includes(needle)) matchedGroups.add(row.id);
    }
  }
  const underMatchedGroup = (row: SheetRowModel) =>
    matchedGroups.has(row.id) || row.path.some((ancestor) => matchedGroups.has(ancestor));

  const kept = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "CONTROL_ITEM") {
      // A heading earns its place by being under a match - or by being the
      // match. Otherwise it is kept only as an ancestor of a Control Item
      // below, which the loop underneath adds.
      if (needle && underMatchedGroup(row)) {
        kept.add(row.id);
        for (const ancestor of row.path) kept.add(ancestor);
      }
      continue;
    }
    const item = row as ControlItemRow;
    if (filters.businessUnits.length && !filters.businessUnits.includes(item.businessUnitCode)) {
      continue;
    }
    if (filters.dics.length && !filters.dics.includes(item.dicCode)) continue;
    if (filters.belowTarget && !isBelowTarget(item)) continue;
    // The pickers and Below target intersect with the search rather than
    // overriding it, so a search inside a filtered sheet narrows what is
    // already there.
    if (needle && !underMatchedGroup(item) && !searchable(item).includes(needle)) continue;
    kept.add(item.id);
    for (const ancestor of item.path) kept.add(ancestor);
  }
  return rows.filter((row) => kept.has(row.id));
}
