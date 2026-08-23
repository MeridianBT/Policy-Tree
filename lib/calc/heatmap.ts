/**
 * Symbol-distribution heatmap: how each Division's evaluation symbols spread
 * across the Ki, month by month.
 *
 * This deliberately never collapses a cell to one "worst" or "average"
 * symbol - the five bands are not a single good-to-bad scale (far above and
 * far below are symmetric extremes, see lib/calc/bands.ts), so picking a
 * single representative symbol per cell would invent a verdict the data
 * does not actually support. Instead every cell carries the full count per
 * symbol, and the caller renders that as a small stacked bar - a
 * distribution, not a score.
 *
 * A Department's items count toward its parent Division's cell, so the
 * heatmap reads as "how is this Division doing, company work and
 * department work together" without a second grouping the reader has to
 * hold in their head.
 */

import type { PeriodKey } from "@/lib/domain/period";
import type { SheetModel, SheetRowModel } from "@/lib/sheet/types";

export interface HeatmapCell {
  divisionCode: string;
  period: PeriodKey;
  /** Count of Control Items landing in each symbol this month, e.g. { "〇": 3, "▲": 1 }. */
  counts: Record<string, number>;
  total: number;
}

/**
 * The Divisions this plan actually uses, in the order `dics` carries them.
 *
 * `dics` lists every org unit in the database, because the sheet's DIC picker
 * and the add-measure form need to offer all of them. A heatmap must not: a
 * division that carries no Control Item in this Ki is not part of this plan,
 * and a row of empty cells for it reads as "nothing keyed yet" when the truth
 * is "nothing was ever planned here". Those are different states and only one
 * of them is worth a reviewer's attention.
 */
export function divisionCodes(
  dics: SheetModel["dics"],
  rows?: readonly SheetRowModel[],
): string[] {
  const all = dics.filter((dic) => dic.type === "DIVISION").map((dic) => dic.code);
  if (!rows) return all;

  const used = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "CONTROL_ITEM") continue;
    const division = topDivisionOf(row.dicCode, dics);
    if (division) used.add(division);
  }
  return all.filter((code) => used.has(code));
}

/** A DIC's own code if it is a Division, or its parent Division's code if it is a Department. */
function topDivisionOf(dicCode: string, dics: SheetModel["dics"]): string | null {
  const dic = dics.find((d) => d.code === dicCode);
  if (!dic) return null;
  return dic.type === "DIVISION" ? dic.code : dic.parentCode;
}

export function buildSymbolHeatmap(
  rows: readonly SheetRowModel[],
  dics: SheetModel["dics"],
  months: readonly PeriodKey[],
): HeatmapCell[] {
  const cellKey = (division: string, period: PeriodKey) => division + "|" + period;
  const grid = new Map<string, HeatmapCell>();
  for (const division of divisionCodes(dics, rows)) {
    for (const period of months) {
      grid.set(cellKey(division, period), { divisionCode: division, period, counts: {}, total: 0 });
    }
  }

  for (const row of rows) {
    if (row.kind !== "CONTROL_ITEM") continue;
    const division = topDivisionOf(row.dicCode, dics);
    if (!division) continue;
    for (const cell of row.cells) {
      if (cell.kind !== "MONTH" || !cell.symbol || !cell.period) continue;
      const bucket = grid.get(cellKey(division, cell.period));
      if (!bucket) continue;
      bucket.counts[cell.symbol] = (bucket.counts[cell.symbol] ?? 0) + 1;
      bucket.total += 1;
    }
  }

  return [...grid.values()];
}
