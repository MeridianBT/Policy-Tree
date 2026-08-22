/**
 * Excel export.
 *
 * Two worksheets, because two different people ask for this file:
 *
 *   "Sheet"  mirrors the screen — the same rows in the same order, the same
 *            seventeen periods, target over actual over achievement. It is for
 *            someone who wants the review sheet in a workbook.
 *   "Data"   is the same figures in long format, one row per Control Item per
 *            period. It is for someone who wants to pivot.
 *
 * Numbers are written as numbers, never as pre-formatted strings, so the file
 * is usable rather than merely readable. Empty stays empty: a cell with no
 * value is left blank, never written as zero — the same rule the sheet follows
 * on screen.
 */

import ExcelJS from "exceljs";
import type { SheetModel, ControlItemRow, GroupRow } from "@/lib/sheet/types";
import { sheetColumns } from "@/components/sheet/columns";
import { indentSteps, groupHeading } from "@/components/sheet/outline";

const INK = "FF141413";
const RULE = "FFDFDEDA";
const BAND = "FFF2F2F0";
const BAND_STRONG = "FFE9E9E6";

export interface ExportOptions {
  model: SheetModel;
  title: string;
  /** Which version the targets came from, for the header stamp. */
  basisLabel: string;
}

export async function buildWorkbook(options: ExportOptions): Promise<ArrayBuffer> {
  const { model, title, basisLabel } = options;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hoshin Kanri";
  workbook.created = new Date();

  buildSheetTab(workbook, options);
  buildDataTab(workbook, options);
  buildEvaluationTab(workbook, model);

  // ExcelJS declares its own Buffer type; an ArrayBuffer is what a Response
  // body actually wants, so normalise here rather than at the call site.
  const written = await workbook.xlsx.writeBuffer();
  return new Uint8Array(written).buffer as ArrayBuffer;
}

// ---------------------------------------------------------------- "Sheet"

function buildSheetTab(workbook: ExcelJS.Workbook, { model, title, basisLabel }: ExportOptions) {
  const sheet = workbook.addWorksheet("Sheet", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 4 }],
    // A3 landscape, matching the print route.
    pageSetup: { orientation: "landscape", paperSize: 8 as never, fitToPage: true, fitToWidth: 1 },
  });

  const columns = sheetColumns(model.kiStartYear);

  sheet.mergeCells(1, 1, 1, 3 + columns.length);
  const heading = sheet.getCell(1, 1);
  heading.value = title;
  heading.font = { bold: true, size: 13, color: { argb: INK } };

  sheet.mergeCells(2, 1, 2, 3 + columns.length);
  const stamp = sheet.getCell(2, 1);
  stamp.value = `${model.kiCode} · ${basisLabel} · exported ${new Date().toLocaleDateString("en-GB")}`;
  stamp.font = { size: 9, color: { argb: "FF57564F" } };

  // Header: period across, then target/actual/achievement stacked in the rows.
  const headerRow = sheet.getRow(4);
  headerRow.values = ["Measures", "Control Item", "DIC", ...columns.map((c) => c.label)];
  headerRow.font = { bold: true, size: 9 };
  headerRow.alignment = { vertical: "bottom" };
  headerRow.eachCell((cell, index) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_STRONG } };
    cell.border = { bottom: { style: "thin", color: { argb: INK } } };
    if (index > 3) cell.alignment = { horizontal: "right", vertical: "bottom" };
  });

  sheet.getColumn(1).width = 44;
  sheet.getColumn(2).width = 26;
  sheet.getColumn(3).width = 7;
  for (let i = 0; i < columns.length; i++) {
    sheet.getColumn(4 + i).width = columns[i].kind === "MONTH" ? 11 : 13;
  }

  let rowNumber = 5;
  for (const row of model.rows) {
    if (row.kind !== "CONTROL_ITEM") {
      const group = row as GroupRow;
      const excelRow = sheet.getRow(rowNumber++);
      excelRow.getCell(1).value = groupHeading(group.statement, group.ordinal);
      excelRow.getCell(1).alignment = { indent: indentSteps(group) * 2 };
      excelRow.font = {
        bold: group.kind !== "OBJECTIVE",
        italic: group.kind === "OBJECTIVE",
        size: group.kind === "GOAL" ? 11 : 10,
      };
      for (let i = 1; i <= 3 + columns.length; i++) {
        excelRow.getCell(i).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: group.kind === "GOAL" ? BAND_STRONG : BAND },
        };
      }
      continue;
    }

    const item = row as ControlItemRow;
    const cellByKey = new Map(item.cells.map((cell) => [cell.key, cell]));
    const numberFormat = formatFor(item.decimalPlaces);

    // Three rows per Control Item: target, actual, achievement with its symbol.
    const targetRow = sheet.getRow(rowNumber++);
    const actualRow = sheet.getRow(rowNumber++);
    const achRow = sheet.getRow(rowNumber++);

    targetRow.getCell(1).value = item.name;
    targetRow.getCell(1).alignment = { indent: indentSteps(item) * 2 };
    targetRow.getCell(2).value = item.measuredAs;
    targetRow.getCell(3).value = item.dicCode;
    sheet.mergeCells(targetRow.number, 1, achRow.number, 1);
    sheet.mergeCells(targetRow.number, 2, achRow.number, 2);
    sheet.mergeCells(targetRow.number, 3, achRow.number, 3);
    targetRow.getCell(1).alignment = { vertical: "middle", wrapText: true, indent: indentSteps(item) * 2 };
    targetRow.getCell(2).alignment = { vertical: "middle", wrapText: true };
    targetRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };

    columns.forEach((column, index) => {
      const cell = cellByKey.get(column.key);
      const at = 4 + index;

      const target = targetRow.getCell(at);
      target.value = cell?.target ?? null;
      target.numFmt = numberFormat;
      target.font = { size: 8, color: { argb: "FF57564F" } };

      const actual = actualRow.getCell(at);
      actual.value = cell?.actual ?? null;
      actual.numFmt = numberFormat;
      actual.font = { size: 10, bold: true };

      const ach = achRow.getCell(at);
      // Achievement is stored as a ratio; Excel's percent format does the rest.
      ach.value = cell?.achievement ?? null;
      ach.numFmt = "0.0%";
      ach.font = { size: 8, color: { argb: symbolArgb(cell?.symbolColor) } };

      for (const excelCell of [target, actual, ach]) {
        excelCell.alignment = { horizontal: "right" };
        if (column.kind !== "MONTH") {
          excelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: column.kind === "KI" ? BAND_STRONG : BAND },
          };
        }
      }

      achRow.getCell(at).border = { bottom: { style: "hair", color: { argb: RULE } } };
    });
  }

  buildLegendRow(sheet, model, rowNumber + 1);
}

// ----------------------------------------------------------------- "Data"

function buildDataTab(workbook: ExcelJS.Workbook, { model, basisLabel }: ExportOptions) {
  const sheet = workbook.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.columns = [
    { header: "Ki", key: "ki", width: 10 },
    { header: "Target basis", key: "basis", width: 16 },
    { header: "Goal", key: "goal", width: 40 },
    { header: "Theme", key: "theme", width: 30 },
    { header: "Objective", key: "objective", width: 40 },
    { header: "Level", key: "level", width: 7 },
    { header: "Measure", key: "measure", width: 32 },
    { header: "Control Item", key: "controlItem", width: 26 },
    { header: "Code", key: "code", width: 14 },
    { header: "DIC", key: "dic", width: 7 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Aggregation", key: "aggregation", width: 12 },
    { header: "Direction", key: "direction", width: 15 },
    { header: "Period", key: "period", width: 10 },
    { header: "Period type", key: "periodType", width: 12 },
    { header: "Target", key: "target", width: 13 },
    { header: "Actual", key: "actual", width: 13 },
    { header: "Gap", key: "gap", width: 13 },
    { header: "Achievement", key: "achievement", width: 13 },
    { header: "Evaluation", key: "symbol", width: 11 },
    { header: "Evaluation label", key: "symbolLabel", width: 18 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, size: 9 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_STRONG } };

  // Ancestor statements, resolved once per group.
  const groupById = new Map<string, GroupRow>();
  for (const row of model.rows) {
    if (row.kind !== "CONTROL_ITEM") groupById.set(row.id, row as GroupRow);
  }

  for (const row of model.rows) {
    if (row.kind !== "CONTROL_ITEM") continue;
    const item = row as ControlItemRow;
    const ancestors = item.path.map((id) => groupById.get(id)).filter(Boolean) as GroupRow[];
    const goal = ancestors.find((a) => a.kind === "GOAL");
    const theme = [...ancestors].reverse().find((a) => a.kind === "THEME");
    const objective = [...ancestors].reverse().find((a) => a.kind === "OBJECTIVE");

    for (const cell of item.cells) {
      const added = sheet.addRow({
        ki: model.kiCode,
        basis: basisLabel,
        goal: goal ? groupHeading(goal.statement, goal.ordinal) : "",
        theme: theme?.statement ?? "",
        objective: objective?.statement ?? "",
        level: item.level,
        measure: item.name,
        controlItem: item.measuredAs,
        code: item.code,
        dic: item.dicCode,
        unit: item.unit,
        aggregation: item.aggregation,
        direction: item.direction === "HIGHER_BETTER" ? "Higher is better" : "Lower is better",
        period: cell.period ?? cell.label,
        periodType: cell.kind === "MONTH" ? "Month" : cell.kind === "QUARTER" ? "Quarter" : "Ki",
        target: cell.target,
        actual: cell.actual,
        gap: cell.gap,
        achievement: cell.achievement,
        symbol: cell.symbol,
        symbolLabel: cell.symbolLabel,
      });

      const numberFormat = formatFor(item.decimalPlaces);
      added.getCell("target").numFmt = numberFormat;
      added.getCell("actual").numFmt = numberFormat;
      added.getCell("gap").numFmt = numberFormat;
      added.getCell("achievement").numFmt = "0.0%";
      added.font = { size: 9 };
    }
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
}

// ------------------------------------------------------------ "Evaluation"

function buildEvaluationTab(workbook: ExcelJS.Workbook, model: SheetModel) {
  const sheet = workbook.addWorksheet("Evaluation");
  sheet.columns = [
    { header: "Symbol", key: "symbol", width: 9 },
    { header: "Meaning", key: "label", width: 22 },
    { header: "From", key: "from", width: 11 },
    { header: "To", key: "to", width: 11 },
  ];
  sheet.getRow(1).font = { bold: true, size: 9 };

  for (const band of model.bands) {
    const row = sheet.addRow({
      symbol: band.symbol,
      label: band.label,
      from: band.minPct,
      to: band.maxPct,
    });
    row.getCell("from").numFmt = "0.0%";
    row.getCell("to").numFmt = "0.0%";
    row.getCell("symbol").font = { size: 12, color: { argb: symbolArgb(band.colorHex) } };
  }

  sheet.addRow([]);
  const note = sheet.addRow([
    "Bands are inclusive at the lower bound: exactly 105.0% is the band starting at 105%.",
  ]);
  note.font = { italic: true, size: 9 };
}

function buildLegendRow(sheet: ExcelJS.Worksheet, model: SheetModel, at: number) {
  const row = sheet.getRow(at);
  row.getCell(1).value = "Evaluation";
  row.getCell(1).font = { bold: true, size: 9 };
  model.bands.forEach((band, index) => {
    const cell = row.getCell(2 + index);
    cell.value = `${band.symbol}  ${band.label}`;
    cell.font = { size: 9, color: { argb: symbolArgb(band.colorHex) } };
  });
}

/** `decimalPlaces` is respected here as strictly as it is on screen. */
function formatFor(decimalPlaces: number): string {
  return decimalPlaces > 0 ? `#,##0.${"0".repeat(decimalPlaces)}` : "#,##0";
}

function symbolArgb(hex: string | null | undefined): string {
  if (!hex) return INK;
  return `FF${hex.replace("#", "").toUpperCase()}`;
}
