/**
 * The upload template, checked by sending it straight back through the parser
 * that reads an upload.
 *
 * That round trip is the whole point of the test. A template is only worth
 * having if the importer recognises every column it writes, and the two live in
 * different modules - so the failure to guard against is a heading changed on
 * one side and not the other, which no amount of reading either file alone
 * would catch.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, prisma, type Fixture } from "./fixture";
import { loadSheet } from "@/lib/sheet/query";
import { buildTemplate } from "@/lib/export/template";
import { readWorkbook } from "@/lib/import/read";
import { buildImportPlan, UNITS, AGGREGATIONS, DIRECTIONS } from "@/lib/import/plan";
import ExcelJS from "exceljs";

let fx: Fixture;

beforeAll(async () => {
  fx = await createFixture();
});

afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

const templateFor = async (kiId: string) =>
  buildTemplate(await loadSheet({ levels: [1, 2, 3], kiId, targetVersionId: null }));

describe("the upload template", () => {
  it("reads back through the importer with every column recognised", async () => {
    const file = await templateFor(fx.kiId);
    const read = await readWorkbook(file);

    expect(read.problems).toEqual([]);
    expect(read.rows.length).toBeGreaterThan(0);

    // Every column the template writes has to arrive as something, or a
    // heading has drifted apart from the map in read.ts.
    const row = read.rows[0];
    expect(row.code).toBeTruthy();
    expect(row.period).toMatch(/^\d{4}-\d{2}$/);
    expect(row.objective).toBeTruthy();
    expect(row.controlItem).toBeTruthy();
    expect(row.dic).toBeTruthy();
    expect(row.businessUnit).toBeTruthy();
    expect(row.unit).toBeTruthy();
    expect(row.aggregation).toBeTruthy();
    expect(row.direction).toBeTruthy();
    expect(row.level).toBe(2);
  });

  it("carries the Ki's own measures and months, one row per month", async () => {
    const model = await loadSheet({ levels: [1, 2, 3], kiId: fx.kiId, targetVersionId: null });
    const read = await readWorkbook(await templateFor(fx.kiId));

    const measures = model.rows.filter((row) => row.kind === "CONTROL_ITEM");
    expect(read.rows).toHaveLength(measures.length * model.months.length);
    expect(new Set(read.rows.map((row) => row.period))).toEqual(new Set(model.months));
  });

  it("offers no derived period, because the importer would skip it", async () => {
    // Quarters and the Ki total roll up from the months. Offering them would
    // invite somebody to type a year total that is silently dropped.
    const read = await readWorkbook(await templateFor(fx.kiId));
    expect(read.skippedNonMonth).toBe(0);
  });

  it("carries no target basis, so it never trips the basis warning", async () => {
    // The stamp belongs to an export taken against a resolved version. A
    // hand-filled template has no basis to declare, and declaring one would
    // warn about a file nobody exported.
    const read = await readWorkbook(await templateFor(fx.kiId));
    expect(read.basis).toBeNull();
  });

  it("gives an unplanned year the headings and nothing else", async () => {
    // Next year, before anybody has typed into it - the case that had no
    // template at all, because there was nothing to export.
    const empty = await prisma.ki.create({
      data: {
        code: `Ki EMPTY ${Date.now().toString(36)}`,
        startDate: new Date(Date.UTC(2030, 3, 1)),
        endDate: new Date(Date.UTC(2031, 2, 31)),
        isCurrent: false,
      },
    });
    try {
      const read = await readWorkbook(await templateFor(empty.id));
      expect(read.rows).toEqual([]);
      expect(read.problems).toEqual([]);
      expect(read.sheetName).toBe("Upload");
    } finally {
      await prisma.ki.delete({ where: { id: empty.id } });
    }
  });

  it("offers only vocabulary the parser accepts", async () => {
    // The dropdowns come from the parser's own lists. This is the assertion
    // that keeps them from being retyped into a second copy that drifts.
    const read = await readWorkbook(await templateFor(fx.kiId));
    for (const row of read.rows) {
      expect(UNITS).toContain(row.unit);
      expect(AGGREGATIONS).toContain(row.aggregation);
      expect(DIRECTIONS as readonly string[]).toContain(row.direction);
    }
  });
});

/**
 * The case the template exists for: planning a year nobody has typed into.
 *
 * Parsing is not enough to prove a template works. Somebody fills it in and
 * uploads it, so this fills one in the way a person would - by typing into the
 * Upload sheet under its own headings - and then asks the importer what it
 * would do. Zero refusals and a created measure is the answer that means the
 * template is usable rather than merely readable.
 */
describe("filling in the template for an unplanned year", () => {
  it("plans a new measure with nothing refused", async () => {
    const empty = await prisma.ki.create({
      data: {
        code: `Ki BLANK ${Date.now().toString(36)}`,
        startDate: new Date(Date.UTC(2031, 3, 1)),
        endDate: new Date(Date.UTC(2032, 2, 31)),
        isCurrent: false,
      },
    });

    try {
      const model = await loadSheet({ levels: [1, 2, 3], kiId: empty.id, targetVersionId: null });
      const blank = await buildTemplate(model);

      // Type into it, addressing columns by their headings rather than by
      // position - which is also how read.ts finds them.
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(blank);
      const sheet = workbook.getWorksheet("Upload")!;
      const headings = (sheet.getRow(1).values as unknown[]).map((value) =>
        typeof value === "string" ? value : "",
      );
      const at = (heading: string) => headings.indexOf(heading);

      const dic = model.dics[0].code;
      const businessUnit = model.businessUnits[0].code;
      for (const [index, period] of model.months.slice(0, 3).entries()) {
        const row = sheet.getRow(2 + index);
        row.getCell(at("Goal")).value = "Profit and Growth";
        row.getCell(at("Level")).value = 2;
        row.getCell(at("Objective")).value = "New vehicle deliveries";
        row.getCell(at("Control Item")).value = "Units delivered";
        row.getCell(at("Code")).value = "AU-VOL";
        row.getCell(at("Department")).value = dic;
        row.getCell(at("Business unit")).value = businessUnit;
        row.getCell(at("Unit")).value = "COUNT";
        row.getCell(at("Decimals")).value = 0;
        row.getCell(at("Aggregation")).value = "SUM";
        row.getCell(at("Direction")).value = "Higher is better";
        row.getCell(at("Period")).value = period;
        row.getCell(at("Target")).value = 4560 + index;
      }
      const filled = new Uint8Array(await workbook.xlsx.writeBuffer()).buffer as ArrayBuffer;

      const read = await readWorkbook(filled);
      expect(read.problems).toEqual([]);
      expect(read.rows).toHaveLength(3);

      const plan = buildImportPlan(
        read.rows,
        {
          nodes: [],
          items: [],
          months: model.months,
          dicCodes: model.dics.map((option) => option.code),
          businessUnitCodes: model.businessUnits.map((unit) => unit.code),
        },
        { targetVersionId: "target", actualVersionId: "actual", allowCreate: true },
      );

      expect(plan.refusals).toEqual([]);
      // A Goal and its Level 2 Objective, created once between the three rows.
      expect(plan.nodes.length).toBeGreaterThan(0);
      expect(plan.measures).toHaveLength(1);
      expect(plan.figures).toHaveLength(3);
    } finally {
      await prisma.ki.delete({ where: { id: empty.id } });
    }
  });
});

describe("the Definitions sheet", () => {
  const notesFor = (controlItemId: string, definition: string) =>
    new Map([
      [
        controlItemId,
        [
          {
            id: "n1",
            controlItemId,
            kind: "DEFINITION" as const,
            body: definition,
            versionCode: null,
            authorId: "u1",
            authorName: "J. Smith",
            createdAt: "2026-03-12T00:00:00.000Z",
            retractedAt: null,
            retractedByName: null,
          },
        ],
      ],
    ]);

  it("comes back through readDefinitions with the columns recognised", async () => {
    const model = await loadSheet({ levels: [1, 2, 3], kiId: fx.kiId, targetVersionId: null });
    const item = model.rows.find((row) => row.kind === "CONTROL_ITEM");
    if (!item) throw new Error("fixture has no measures");

    const file = await buildTemplate(model, notesFor(item.id, "Retail units invoiced."));
    const read = await readWorkbook(file);

    const definition = read.definitions.find((row) => row.definition);
    expect(definition?.definition).toBe("Retail units invoiced.");
    // Pre-filled, so editing it in Excel is editing it rather than retyping
    // it - and unedited, it round-trips to a no-op.
    expect(definition?.code).toBeTruthy();
  });

  /*
   * The sheet picker used to take the first worksheet carrying rows, which was
   * right only because Upload happened to be added before Reference. With a
   * third populated sheet in the file that was one reorder away from reading
   * the definitions as a plan.
   */
  it("does not become the sheet the figures are read from", async () => {
    const model = await loadSheet({ levels: [1, 2, 3], kiId: fx.kiId, targetVersionId: null });
    const item = model.rows.find((row) => row.kind === "CONTROL_ITEM");
    if (!item) throw new Error("fixture has no measures");

    const file = await buildTemplate(model, notesFor(item.id, "Retail units invoiced."));
    const read = await readWorkbook(file);

    expect(read.sheetName).toBe("Upload");
    expect(read.rows.every((row) => row.period.match(/^\d{4}-\d{2}$/))).toBe(true);
  });

  it("leaves the rationale column empty, because an entry is added and never edited", async () => {
    const model = await loadSheet({ levels: [1, 2, 3], kiId: fx.kiId, targetVersionId: null });
    const file = await buildTemplate(model);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    const sheet = workbook.getWorksheet("Definitions");
    expect(sheet).toBeDefined();

    const headers = sheet!.getRow(1).values as string[];
    expect(headers).toContain("Rationale to add");
    expect(sheet!.getRow(2).getCell(4).value).toBeFalsy();
  });

  it("drops rows with nothing filled in, so a returned template is mostly no-ops", async () => {
    const model = await loadSheet({ levels: [1, 2, 3], kiId: fx.kiId, targetVersionId: null });
    // No notes at all: every Definitions row comes back blank in both input
    // columns and should not travel as an empty write.
    const read = await readWorkbook(await buildTemplate(model));
    expect(read.definitions).toEqual([]);
  });
});

describe("a workbook carrying only definitions", () => {
  /*
   * Somebody writing up the reasoning for a plan whose numbers are already
   * keyed has no reason to send the months back, and deleting the Upload sheet
   * is the obvious way to say so. This used to be refused as "no rows in it".
   */
  it("is read rather than refused for having no figures", async () => {
    const model = await loadSheet({ levels: [1, 2, 3], kiId: fx.kiId, targetVersionId: null });
    const item = model.rows.find((row) => row.kind === "CONTROL_ITEM");
    if (!item) throw new Error("fixture has no measures");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      await buildTemplate(
        model,
        new Map([
          [
            item.id,
            [
              {
                id: "n1",
                controlItemId: item.id,
                kind: "DEFINITION" as const,
                body: "Counted at invoice.",
                versionCode: null,
                authorId: "u1",
                authorName: "J. Smith",
                createdAt: "2026-03-12T00:00:00.000Z",
                retractedAt: null,
                retractedByName: null,
              },
            ],
          ],
        ]),
      ),
    );
    workbook.removeWorksheet(workbook.getWorksheet("Upload")!.id);

    const read = await readWorkbook((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    expect(read.rows).toEqual([]);
    expect(read.definitions.some((row) => row.definition === "Counted at invoice.")).toBe(true);
  });

  it("still refuses a workbook with nothing in it at all", async () => {
    const empty = new ExcelJS.Workbook();
    empty.addWorksheet("Sheet1");
    await expect(readWorkbook((await empty.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(
      /no rows/i,
    );
  });
});
