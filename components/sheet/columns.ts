/**
 * Column geometry, shared by the screen grid and the print sheet so the two
 * cannot drift apart.
 */

import { QUARTERS, monthLabel, quarterMonths, type QuarterCode } from "@/lib/domain/period";

export interface SheetColumn {
  key: string;
  label: string;
  kind: "MONTH" | "QUARTER" | "KI";
  quarter: QuarterCode | null;
}

export function sheetColumns(kiStartYear: number): SheetColumn[] {
  const columns: SheetColumn[] = [];
  for (const quarter of QUARTERS) {
    for (const period of quarterMonths(kiStartYear, quarter)) {
      columns.push({ key: period, label: monthLabel(period), kind: "MONTH", quarter });
    }
    columns.push({ key: quarter, label: quarter, kind: "QUARTER", quarter });
  }
  columns.push({ key: "KI", label: "Ki Total", kind: "KI", quarter: null });
  return columns;
}

/** Tint and boundary treatment that separates summaries from months. */
export function columnClass(kind: SheetColumn["kind"]): string {
  switch (kind) {
    case "QUARTER":
      return "bg-paper-band border-l border-rule-strong";
    case "KI":
      return "bg-paper-band-strong border-l-2 border-rule-strong font-medium";
    default:
      return "bg-paper";
  }
}

export function columnWidth(kind: SheetColumn["kind"]): number {
  return kind === "KI" ? 96 : kind === "QUARTER" ? 88 : 74;
}
