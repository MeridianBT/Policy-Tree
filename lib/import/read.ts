/**
 * Reading a workbook back into rows.
 *
 * The counterpart to lib/export/workbook.ts, and deliberately its mirror: the
 * export's **Data** tab is the template, so the round trip is export, edit,
 * upload with no new file format to document. A hand-made sheet carrying just
 * Code, Period and Target works too, because columns are found by name rather
 * than by position.
 *
 * Nothing here decides anything. It turns bytes into rows and says which rows
 * it could not read; what may be written, created or refused is
 * lib/import/plan.ts, which is pure and has no idea a file was involved.
 */

import ExcelJS from "exceljs";
import { dateToPeriod, type PeriodKey } from "@/lib/domain/period";

/** One month of one Control Item, as the file states it. */
export interface ImportRow {
  /** 1-based row number in the sheet, so a refusal can name where it is. */
  row: number;
  code: string;
  period: PeriodKey;
  /** A number, a formula as typed, or null when the cell was empty. */
  target: string | number | null;
  actual: string | number | null;
  /** Structure columns, used only when a row would create something. */
  goal: string;
  theme: string;
  objective: string;
  measure: string;
  controlItem: string;
  dic: string;
  businessUnit: string;
  level: number | null;
  unit: string;
  decimals: number | null;
  basis: string;
  aggregation: string;
  direction: string;
}

export interface ReadProblem {
  row: number;
  reason: string;
}

export interface ReadResult {
  rows: ImportRow[];
  /** Rows that could not be read at all - a missing code, an unusable period. */
  problems: ReadProblem[];
  /** Rows skipped for being derived columns rather than months. */
  skippedNonMonth: number;
  /**
   * The export's own "Target: PRB" stamp when the file carries one.
   *
   * Worth reading because the Target column of an export taken on "latest
   * forecast" is a *resolution* across versions, not any one version's stored
   * figures - writing it back into OB would copy the resolution over the
   * original budget, and the only warning would be a large number in the
   * preview.
   */
  basis: string | null;
  sheetName: string;
}

export class ImportReadError extends Error {}

/** A file bigger than this is not a plan, and reading it would block a worker. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** 83 measures x 17 periods is under 1,500 rows; this is room to grow into. */
export const MAX_ROWS = 20_000;

/** Header text to the key it means, matched loosely so spacing cannot break it. */
const COLUMNS: Record<string, keyof ImportRow> = {
  code: "code",
  period: "period",
  target: "target",
  actual: "actual",
  goal: "goal",
  theme: "theme",
  objective: "objective",
  measure: "measure",
  controlitem: "controlItem",
  dic: "dic",
  department: "dic",
  businessunit: "businessUnit",
  level: "level",
  unit: "unit",
  decimals: "decimals",
  decimalplaces: "decimals",
  aggregation: "aggregation",
  rollup: "aggregation",
  direction: "direction",
  basis: "basis",
  // The export heads this column "Target basis".
  targetbasis: "basis",
};

function normaliseHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * A cell's text. exceljs hands back a string, a number, a date, a rich-text
 * object (which is what the export writes for an emphasised name), or a
 * formula result - and a caller that assumed "string" would silently read
 * "[object Object]" as a measure's name.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((run) => run.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
  }
  return "";
}

/**
 * A figure as the file gives it: a number, a formula to be evaluated by the
 * application's own engine, or null for an empty cell.
 *
 * A blank cell means "nothing to say about this month", never "clear it". A
 * bulk path that read every empty cell as a deletion would wipe a year on a
 * file somebody trimmed columns from - and clearing a figure is a deliberate
 * act that belongs where somebody can see the cell they are emptying.
 */
function cellValue(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return null;
  const text = cellText(value);
  if (text === "") return null;
  // A cell somebody typed as a formula for this application, rather than one
  // Excel already evaluated - the same convention the entry grid uses.
  if (text.startsWith("=")) return text;
  const numeric = Number(text.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : text;
}

/**
 * The period, as `2026-04` or as a real date.
 *
 * Both, because Excel turns the first into the second the moment anybody
 * retypes the cell, and a reader that accepted only the string would reject a
 * file that looks perfectly correct on screen.
 */
function readPeriod(value: ExcelJS.CellValue): PeriodKey | null {
  if (value instanceof Date) return dateToPeriod(value);
  const text = cellText(value);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  // An ISO timestamp, which is what a date arrives as through cellText.
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 7);
  return null;
}

function readDecimals(value: ExcelJS.CellValue): number | null {
  const text = cellText(value);
  if (text === "") return null;
  const places = Number(text);
  return Number.isInteger(places) && places >= 0 && places <= 4 ? places : null;
}

export async function readWorkbook(buffer: ArrayBuffer): Promise<ReadResult> {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new ImportReadError(
      `That file is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportReadError("That file could not be opened as a workbook (.xlsx).");
  }

  // The export's own long-format tab first; otherwise whatever the file leads
  // with, so a hand-made sheet needs no particular name.
  const sheet =
    workbook.getWorksheet("Data") ?? workbook.worksheets.find((candidate) => candidate.rowCount > 1);
  if (!sheet) throw new ImportReadError("That workbook has no rows in it.");

  const headerRow = sheet.getRow(1);
  const byColumn = new Map<number, keyof ImportRow>();
  headerRow.eachCell((cell, columnNumber) => {
    const key = COLUMNS[normaliseHeader(cellText(cell))];
    if (key) byColumn.set(columnNumber, key);
  });
  let periodTypeColumn: number | null = null;
  headerRow.eachCell((cell, columnNumber) => {
    if (normaliseHeader(cellText(cell)) === "periodtype") periodTypeColumn = columnNumber;
  });

  const has = (key: keyof ImportRow) => [...byColumn.values()].includes(key);
  if (!has("code") || !has("period")) {
    throw new ImportReadError(
      "That sheet needs at least a Code column and a Period column. The Data tab of an " +
        "Export to Excel has them already.",
    );
  }
  if (!has("target") && !has("actual")) {
    throw new ImportReadError("That sheet has no Target column and no Actual column, so there is nothing to write.");
  }

  const rows: ImportRow[] = [];
  const problems: ReadProblem[] = [];
  let skippedNonMonth = 0;

  for (let number = 2; number <= sheet.rowCount; number++) {
    if (rows.length >= MAX_ROWS) {
      throw new ImportReadError(`That sheet has more than ${MAX_ROWS.toLocaleString()} rows.`);
    }
    const sheetRow = sheet.getRow(number);

    // Quarters and the Ki total are rolled up from the months at read time, so
    // there is nothing behind them to write into - the same rule the entry
    // grid enforces. A sheet with no such column is all months by definition.
    if (periodTypeColumn !== null) {
      const kind = cellText(sheetRow.getCell(periodTypeColumn)).toLowerCase();
      if (kind && kind !== "month") {
        skippedNonMonth += 1;
        continue;
      }
    }

    const raw: Record<string, ExcelJS.CellValue> = {};
    for (const [columnNumber, key] of byColumn) raw[key] = sheetRow.getCell(columnNumber).value;

    const code = cellText(raw.code ?? null);
    const period = readPeriod(raw.period ?? null);
    const target = cellValue(raw.target ?? null);
    const actual = cellValue(raw.actual ?? null);

    // A row with nothing in it at all is the blank line under a table, not a
    // mistake worth reporting.
    if (!code && !period && target === null && actual === null) continue;

    if (!period) {
      problems.push({ row: number, reason: `Period "${cellText(raw.period ?? null)}" is not a month.` });
      continue;
    }

    const level = Number(cellText(raw.level ?? null));
    rows.push({
      row: number,
      code,
      period,
      target,
      actual,
      goal: cellText(raw.goal ?? null),
      theme: cellText(raw.theme ?? null),
      objective: cellText(raw.objective ?? null),
      measure: cellText(raw.measure ?? null),
      controlItem: cellText(raw.controlItem ?? null),
      dic: cellText(raw.dic ?? null),
      businessUnit: cellText(raw.businessUnit ?? null),
      level: Number.isFinite(level) && level > 0 ? level : null,
      unit: cellText(raw.unit ?? null),
      decimals: readDecimals(raw.decimals ?? null),
      basis: cellText(raw.basis ?? null),
      aggregation: cellText(raw.aggregation ?? null),
      direction: cellText(raw.direction ?? null),
    });
  }

  return {
    rows,
    problems,
    skippedNonMonth,
    sheetName: sheet.name,
    basis: rows.find((row) => row.basis)?.basis ?? null,
  };
}
