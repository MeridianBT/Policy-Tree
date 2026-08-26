/**
 * Which rows a set of filters keeps.
 *
 * Pure, and deliberately in its own module rather than inside SheetGrid: the
 * component file is .tsx and cannot be imported by the test runner, and this
 * is a rule worth testing directly - the same reason lib/auth/permissions.ts
 * and components/sheet/outline.ts sit apart from the components that use them.
 */

import type { ControlItemRow, SheetRowModel } from "@/lib/sheet/types";

export interface SheetFilters {
  dics: string[];
  themeIds: string[];
  symbols: string[];
  /**
   * Business unit codes. Empty means every unit - the whole-company view,
   * which shows all rows together rather than merging them: a motorcycle
   * volume and a car volume sit on separate rows and are never added up.
   */
  businessUnits: string[];
}

export const EMPTY_FILTERS: SheetFilters = {
  dics: [],
  themeIds: [],
  symbols: [],
  businessUnits: [],
};

export function matchRows(rows: SheetRowModel[], filters: SheetFilters): SheetRowModel[] {
  const noFilter =
    filters.dics.length === 0 &&
    filters.themeIds.length === 0 &&
    filters.symbols.length === 0 &&
    filters.businessUnits.length === 0;
  if (noFilter) return rows;

  const kept = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "CONTROL_ITEM") continue;
    const item = row as ControlItemRow;
    if (filters.dics.length && !filters.dics.includes(item.dicCode)) continue;
    if (filters.businessUnits.length && !filters.businessUnits.includes(item.businessUnitCode)) {
      continue;
    }
    if (filters.themeIds.length && !item.path.some((id) => filters.themeIds.includes(id))) continue;
    if (filters.symbols.length && !(item.kiSymbol && filters.symbols.includes(item.kiSymbol))) continue;
    kept.add(item.id);
    for (const ancestor of item.path) kept.add(ancestor);
  }
  return rows.filter((row) => kept.has(row.id));
}
