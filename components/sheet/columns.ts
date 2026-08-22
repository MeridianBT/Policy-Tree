/**
 * Column geometry, shared by the screen grid and the print sheet so the two
 * cannot drift apart.
 *
 * Quarters can be condensed: folding Q1's three month columns away leaves the
 * Q1 column standing in for them. This is a view concern only — the quarter
 * figure is derived from the monthly grain either way, so condensing changes
 * what is shown and never what is computed.
 */

import { QUARTERS, monthLabel, quarterMonths, type QuarterCode } from "@/lib/domain/period";

export interface SheetColumn {
  key: string;
  label: string;
  kind: "MONTH" | "QUARTER" | "KI";
  quarter: QuarterCode | null;
  /** QUARTER columns only: true when this quarter's months are folded away. */
  condensed?: boolean;
}

export interface ColumnOptions {
  /** Quarters whose month columns are hidden. */
  condensedQuarters?: Iterable<QuarterCode>;
}

export function sheetColumns(kiStartYear: number, options?: ColumnOptions): SheetColumn[] {
  const condensed = new Set(options?.condensedQuarters ?? []);
  const columns: SheetColumn[] = [];

  for (const quarter of QUARTERS) {
    if (!condensed.has(quarter)) {
      for (const period of quarterMonths(kiStartYear, quarter)) {
        columns.push({ key: period, label: monthLabel(period), kind: "MONTH", quarter });
      }
    }
    columns.push({
      key: quarter,
      label: quarter,
      kind: "QUARTER",
      quarter,
      condensed: condensed.has(quarter),
    });
  }

  columns.push({ key: "KI", label: "Ki Total", kind: "KI", quarter: null });
  return columns;
}

/**
 * Tint and boundary treatment that separates summaries from months. A condensed
 * quarter is tinted a step darker, so a column standing in for three hidden
 * months reads differently from one sitting beside them.
 */
export function columnClass(kind: SheetColumn["kind"], condensed?: boolean): string {
  switch (kind) {
    case "QUARTER":
      return condensed
        ? "bg-paper-band-strong border-l border-rule-strong"
        : "bg-paper-band border-l border-rule-strong";
    case "KI":
      return "bg-paper-band-strong border-l-2 border-rule-strong font-medium";
    default:
      return "bg-paper";
  }
}

export function columnWidth(kind: SheetColumn["kind"]): number {
  return kind === "KI" ? 96 : kind === "QUARTER" ? 88 : 74;
}

export const ALL_QUARTERS: readonly QuarterCode[] = QUARTERS;
