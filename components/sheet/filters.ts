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
 */

import type { ControlItemRow, SheetRowModel } from "@/lib/sheet/types";

export interface SheetFilters {
  /**
   * Business unit codes. Empty means every unit - the whole-company view,
   * which shows all rows together rather than merging them: a motorcycle
   * volume and a car volume sit on separate rows and are never added up.
   */
  businessUnits: string[];
  /** Division and Department codes, matched against the row's own DIC. */
  dics: string[];
}

export const EMPTY_FILTERS: SheetFilters = {
  businessUnits: [],
  dics: [],
};

export function matchRows(rows: SheetRowModel[], filters: SheetFilters): SheetRowModel[] {
  const noFilter = filters.businessUnits.length === 0 && filters.dics.length === 0;
  if (noFilter) return rows;

  const kept = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "CONTROL_ITEM") continue;
    const item = row as ControlItemRow;
    if (filters.businessUnits.length && !filters.businessUnits.includes(item.businessUnitCode)) {
      continue;
    }
    if (filters.dics.length && !filters.dics.includes(item.dicCode)) continue;
    kept.add(item.id);
    for (const ancestor of item.path) kept.add(ancestor);
  }
  return rows.filter((row) => kept.has(row.id));
}
