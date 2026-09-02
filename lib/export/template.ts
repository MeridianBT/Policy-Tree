/**
 * The upload template: a workbook shaped exactly like what the importer reads.
 *
 * The panel used to say "the Data tab of an Export to Excel is the template",
 * which works for editing a plan that already exists and fails in the case the
 * year switcher was built for. A Ki being planned for next year has nothing to
 * export, so the person with the most to upload had no template at all. And
 * seven of the export's twenty-two columns are results rather than inputs -
 * Gap, Achievement, Evaluation, Evaluation label, Period type, Ki, Target basis
 * - so "edit this and send it back" invites somebody to fill in Achievement and
 * wonder why nothing happened.
 *
 * So this carries the fifteen columns `lib/import/read.ts` actually reads, and
 * nothing else. Two sheets:
 *
 *   "Upload"     the grid to fill in, pre-filled with the Ki's own measures
 *                when it has any, so a populated year still round-trips.
 *   "Reference"  what each column is for, which are needed to create a measure
 *                as opposed to update a figure, and every value the parser will
 *                accept - which is also where the dropdowns point.
 *
 * The vocabulary comes from `lib/import/plan.ts` rather than being retyped
 * here, because a template offering a value the parser refuses is worse than no
 * template.
 */

import ExcelJS from "exceljs";
import type { SheetModel, ControlItemRow, GroupRow } from "@/lib/sheet/types";
import { groupHeading } from "@/components/sheet/outline";
import { plainText } from "@/lib/text/emphasis";
import { UNITS, AGGREGATIONS, DIRECTIONS } from "@/lib/import/plan";

const BAND_STRONG = "FFE9E9E6";
const INK_FAINT = "FF8A8985";

/** The constrained columns, in the order their values sit on the Reference sheet. */
const VOCABULARY_ORDER = [
  "departments",
  "businessUnits",
  "units",
  "aggregations",
  "directions",
  "periods",
] as const;
type VocabularyKey = (typeof VOCABULARY_ORDER)[number];
type Vocabulary = Record<VocabularyKey, { title: string; values: string[] }>;

/** Room to type into below whatever is pre-filled, still carrying dropdowns. */
const SPARE_ROWS = 400;

interface TemplateColumn {
  header: string;
  key: string;
  width: number;
  /** Which Reference column holds this one's permitted values, if any. */
  vocabulary?: VocabularyKey;
  note: string;
  /** Whether a row creating a new measure has to carry it. */
  needed: "new measure" | "always" | "optional";
}

/*
 * Header text matters: `read.ts` matches columns by name, case and spacing
 * ignored. "Department" is what every screen calls the DIC and read.ts accepts
 * both spellings; the Reference sheet says so, for anyone holding an export
 * beside this file.
 */
const COLUMNS: TemplateColumn[] = [
  { header: "Goal", key: "goal", width: 38, note: "The Level 1 Goal this ladders into. Matched on its text.", needed: "new measure" },
  { header: "Parent objective", key: "parentObjective", width: 36, note: "The Objective above this one. Leave blank for a Level 2, whose parent is the Goal.", needed: "optional" },
  { header: "Level", key: "level", width: 7, note: "2 or 3. A Level 4 department branch has to be started on the sheet.", needed: "optional" },
  { header: "Objective", key: "objective", width: 34, note: "The statement this row records - what the sheet prints beside the figures.", needed: "new measure" },
  { header: "Control Item", key: "controlItem", width: 26, note: "How it is measured: \"Units sold\", \"% of sales\".", needed: "new measure" },
  { header: "Code", key: "code", width: 14, note: "The code a formula addresses. Matches an existing measure, or names a new one.", needed: "always" },
  { header: "Department", key: "dic", width: 10, vocabulary: "departments", note: "Who is accountable. The export heads this column \"DIC\"; both are read.", needed: "new measure" },
  { header: "Business unit", key: "businessUnit", width: 14, vocabulary: "businessUnits", note: "AUTO, MC, PP or SHARED.", needed: "new measure" },
  { header: "Unit", key: "unit", width: 11, vocabulary: "units", note: "What the number is. Defaults to COUNT.", needed: "optional" },
  { header: "Decimals", key: "decimals", width: 9, note: "0 to 4. Defaults to 0.", needed: "optional" },
  { header: "Aggregation", key: "aggregation", width: 13, vocabulary: "aggregations", note: "How months roll into a quarter and a year. Defaults to SUM.", needed: "optional" },
  { header: "Direction", key: "direction", width: 16, vocabulary: "directions", note: "Whether higher or lower is the good end. Defaults to higher.", needed: "optional" },
  { header: "Period", key: "period", width: 10, vocabulary: "periods", note: "A month of this Ki, as YYYY-MM. One row per month.", needed: "always" },
  { header: "Target", key: "target", width: 13, note: "A number, or a formula. Writes to the version chosen on the upload form.", needed: "optional" },
  { header: "Actual", key: "actual", width: 13, note: "A number, or a formula. Always writes to the actuals version.", needed: "optional" },
];


export async function buildTemplate(model: SheetModel): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hoshin Kanri";
  workbook.created = new Date();

  const vocabulary: Vocabulary = {
    departments: { title: "Department", values: model.dics.map((dic) => dic.code) },
    businessUnits: { title: "Business unit", values: model.businessUnits.map((unit) => unit.code) },
    units: { title: "Unit", values: [...UNITS] },
    aggregations: { title: "Aggregation", values: [...AGGREGATIONS] },
    directions: { title: "Direction", values: [...DIRECTIONS] },
    periods: { title: "Period", values: [...model.months] },
  };

  const upload = workbook.addWorksheet("Upload", { views: [{ state: "frozen", ySplit: 1 }] });
  const reference = workbook.addWorksheet("Reference");

  buildReference(reference, model, vocabulary);
  buildUpload(upload, model, vocabulary);

  const written = await workbook.xlsx.writeBuffer();
  return new Uint8Array(written).buffer as ArrayBuffer;
}

// ------------------------------------------------------------------ "Upload"

function buildUpload(
  sheet: ExcelJS.Worksheet,
  model: SheetModel,
  vocabulary: Vocabulary,
) {
  sheet.columns = COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, size: 9 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_STRONG } };

  const groupById = new Map<string, GroupRow>();
  for (const row of model.rows) {
    if (row.kind !== "CONTROL_ITEM") groupById.set(row.id, row as GroupRow);
  }

  /*
   * A populated Ki comes back pre-filled, so "edit it and send it back" still
   * works and is now a cleaner file than the export was. An empty Ki - next
   * year, before anybody has typed into it - gets the header and the dropdowns
   * and nothing else. No example rows on this sheet on purpose: an example
   * left in place is a measure somebody did not mean to create, and the worked
   * one lives on Reference where it cannot be uploaded by accident.
   */
  for (const row of model.rows) {
    if (row.kind !== "CONTROL_ITEM") continue;
    const item = row as ControlItemRow;
    // Level 4 rows are refused by the importer, so offering them here would be
    // handing somebody a file that cannot be sent back.
    if (item.level === 4) continue;

    const ancestors = item.path.map((id) => groupById.get(id)).filter(Boolean) as GroupRow[];
    const goal = ancestors.find((ancestor) => ancestor.kind === "GOAL");
    const parent = [...ancestors].reverse().find((ancestor) => ancestor.kind === "OBJECTIVE");

    for (const cell of item.cells) {
      // Months only. Quarters and the Ki total are rolled up from these, and
      // the importer skips them - a template offering them would invite
      // somebody to type a year total that is silently dropped.
      if (cell.kind !== "MONTH" || !cell.period) continue;
      const added = sheet.addRow({
        goal: goal ? plainText(groupHeading(goal.statement, goal.ordinal)) : "",
        parentObjective: plainText(parent?.statement ?? ""),
        level: item.level,
        objective: plainText(item.name),
        controlItem: item.measuredAs,
        code: item.code,
        dic: item.dicCode,
        businessUnit: item.businessUnitCode,
        unit: item.unit,
        decimals: item.decimalPlaces,
        aggregation: item.aggregation,
        direction: item.direction === "HIGHER_BETTER" ? "Higher is better" : "Lower is better",
        period: cell.period,
        target: cell.target,
        actual: cell.actual,
      });
      added.font = { size: 9 };
    }
  }

  applyValidation(sheet, vocabulary, sheet.rowCount + SPARE_ROWS);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
}

/**
 * Dropdowns, pointed at the Reference sheet's own columns.
 *
 * A range rather than a literal list: Excel caps an inline list at 255
 * characters, and forty-five department codes are well past that - the cap is
 * silent, so the validation simply would not appear.
 */
function applyValidation(
  sheet: ExcelJS.Worksheet,
  vocabulary: Vocabulary,
  lastRow: number,
) {
  COLUMNS.forEach((column, index) => {
    if (!column.vocabulary) return;
    const list = vocabulary[column.vocabulary];
    if (list.values.length === 0) return;
    const letter = referenceColumnLetter(column.vocabulary);
    const formula = `Reference!$${letter}$${REFERENCE_FIRST_VALUE_ROW}:$${letter}$${
      REFERENCE_FIRST_VALUE_ROW + list.values.length - 1
    }`;
    for (let row = 2; row <= lastRow; row++) {
      sheet.getCell(row, index + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: column.header,
        error: `Pick one of the ${list.title} values on the Reference sheet.`,
      };
    }
  });
}

// --------------------------------------------------------------- "Reference"

/** Where the vocabulary columns start on Reference, so validation can point at them. */
const REFERENCE_FIRST_VALUE_ROW = 3;

function referenceColumnLetter(key: VocabularyKey): string {
  // A, B, C … in VOCABULARY_ORDER. Six columns, so a single letter always.
  return String.fromCharCode(65 + VOCABULARY_ORDER.indexOf(key));
}

function buildReference(
  sheet: ExcelJS.Worksheet,
  model: SheetModel,
  vocabulary: Vocabulary,
) {
  // The permitted values, one column each, read by the Upload sheet's dropdowns.
  VOCABULARY_ORDER.forEach((key, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = key === "departments" ? 16 : 18;
    const title = sheet.getCell(1, index + 1);
    title.value = vocabulary[key].title;
    title.font = { bold: true, size: 9 };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_STRONG } };
    vocabulary[key].values.forEach((value, offset) => {
      const cell = sheet.getCell(REFERENCE_FIRST_VALUE_ROW + offset, index + 1);
      cell.value = value;
      cell.font = { size: 9 };
    });
  });

  const notesColumn = VOCABULARY_ORDER.length + 2;
  sheet.getColumn(notesColumn).width = 22;
  sheet.getColumn(notesColumn + 1).width = 14;
  sheet.getColumn(notesColumn + 2).width = 76;

  let row = 1;
  const write = (text: string, bold = false, indentCell = notesColumn) => {
    const cell = sheet.getCell(row, indentCell);
    cell.value = text;
    cell.font = { size: 9, bold, color: bold ? undefined : { argb: INK_FAINT } };
    row += 1;
  };

  write(`Upload template — ${model.kiCode}`, true);
  write("Fill in the Upload sheet and send it back through Admin › Structure › Upload a workbook.");
  write("Preview first: it writes nothing until you press Apply, and says what it would do.");
  row += 1;

  write("What an upload can do", true);
  write("It adds and updates. It never deletes, never renames a statement, and never moves a");
  write("measure between Objectives or departments — those stay on the sheet, one row at a time.");
  write("An empty cell means \"nothing to say\", never \"clear it\".");
  write("A Level 4 department branch has to be started on the sheet, where the Objective it");
  write("ladders into is chosen. Rows at Level 4 are refused.");
  row += 1;

  write("The columns", true);
  const headings = sheet.getRow(row);
  headings.getCell(notesColumn).value = "Column";
  headings.getCell(notesColumn + 1).value = "Needed";
  headings.getCell(notesColumn + 2).value = "What it is";
  headings.font = { bold: true, size: 9 };
  row += 1;
  for (const column of COLUMNS) {
    const line = sheet.getRow(row);
    line.getCell(notesColumn).value = column.header;
    line.getCell(notesColumn + 1).value =
      column.needed === "always" ? "Always" : column.needed === "new measure" ? "New measure" : "Optional";
    line.getCell(notesColumn + 2).value = column.note;
    line.font = { size: 9 };
    row += 1;
  }
  row += 1;

  write("\"Always\" is needed on every row: a Code says which measure, a Period says which month.");
  write("\"New measure\" is needed only on a row bringing something into the plan that is not");
  write("there yet, and only when the upload form's \"let this file add new rows\" box is ticked.");
  write("To update a figure on a measure that already exists, Code, Period and Target are enough.");
  row += 1;

  write("A worked row", true);
  const exampleHeader = sheet.getRow(row);
  COLUMNS.forEach((column, index) => {
    const cell = exampleHeader.getCell(notesColumn + index);
    cell.value = column.header;
    cell.font = { bold: true, size: 8 };
  });
  row += 1;
  const example = sheet.getRow(row);
  const values = [
    "1.  Profit and Growth",
    "",
    2,
    "New vehicle deliveries",
    "Units delivered",
    "AU-VOL",
    model.dics[0]?.code ?? "AUTO",
    model.businessUnits[0]?.code ?? "AUTO",
    "COUNT",
    0,
    "SUM",
    "Higher is better",
    model.months[0] ?? "2026-04",
    4560,
    "",
  ];
  values.forEach((value, index) => {
    const cell = example.getCell(notesColumn + index);
    cell.value = value === "" ? null : value;
    cell.font = { size: 8 };
  });
  row += 2;
  sheet.getCell(row, notesColumn).value =
    "One row per measure per month, so a measure planned across the year is twelve rows.";
  sheet.getCell(row, notesColumn).font = { size: 9, color: { argb: INK_FAINT } };
}
