/**
 * Integration tests: the formula engine, the entry save path and the
 * permission rules, against a real PostgreSQL database.
 *
 * These cover the acceptance checks that only mean anything once storage is
 * involved - cached recompute, cycle rejection by name, and the fact that a
 * locked version cannot be edited by anyone at all.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, codeOf, prisma, readCell, setRaw, type Fixture } from "./fixture";
import { saveEntry, VersionLockedError } from "@/lib/entries/save";
import { loadSheet } from "@/lib/sheet/query";
import type { ControlItemRow } from "@/lib/sheet/types";
import { NotPermittedError } from "@/lib/auth/errors";
import { FormulaError } from "@/lib/formula/errors";

let fx: Fixture;
let codes: Record<string, string>;

beforeAll(async () => {
  fx = await createFixture();
  codes = {
    A: await codeOf(fx.items.A),
    B: await codeOf(fx.items.B),
    C: await codeOf(fx.items.C),
  };
});

afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

describe("saving a raw value", () => {
  it("writes the cell and an audit row", async () => {
    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.A,
      period: "2026-04",
      planVersionId: fx.versions["2QFC"],
      input: "1500",
    });
    expect(result.value).toBe(1500);

    const stored = await readCell(fx.items.A, "2026-04", fx.versions["2QFC"]);
    expect(stored.value).toBe(1500);

    const audits = await prisma.entryAudit.findMany({ where: { entryId: result.entryId } });
    expect(audits).toHaveLength(1);
    expect(Number(audits[0].newValue)).toBe(1500);
    expect(audits[0].oldValue).toBeNull();
  });

  it("records the previous value on the next edit, and never deletes the earlier row", async () => {
    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.A,
      period: "2026-04",
      planVersionId: fx.versions["2QFC"],
      input: "1600",
    });
    const audits = await prisma.entryAudit.findMany({
      where: { entry: { controlItemId: fx.items.A, planVersionId: fx.versions["2QFC"] } },
      orderBy: { changedAt: "asc" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
    const latest = audits[audits.length - 1];
    expect(Number(latest.oldValue)).toBe(1500);
    expect(Number(latest.newValue)).toBe(1600);
  });

  it("clears a cell to null rather than to zero", async () => {
    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.A,
      period: "2026-05",
      planVersionId: fx.versions["2QFC"],
      input: "  ",
    });
    expect((await readCell(fx.items.A, "2026-05", fx.versions["2QFC"])).value).toBeNull();
  });

  it("rejects text that is not a number", async () => {
    await expect(
      saveEntry(fx.users.admin, {
        controlItemId: fx.items.A,
        period: "2026-06",
        planVersionId: fx.versions["2QFC"],
        input: "about 500",
      }),
    ).rejects.toThrow(/is not a number/);
  });

  it("accepts a value typed with thousands separators", async () => {
    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.A,
      period: "2026-06",
      planVersionId: fx.versions["2QFC"],
      input: "12,345",
    });
    expect(result.value).toBe(12345);
  });
});

describe("locked versions", () => {
  it("refuses an edit from an ADMIN", async () => {
    await expect(
      saveEntry(fx.users.admin, {
        controlItemId: fx.items.A,
        period: "2026-04",
        planVersionId: fx.versions.PRB,
        input: "1",
      }),
    ).rejects.toBeInstanceOf(VersionLockedError);
  });

  it("refuses an edit from an OWNER who is otherwise responsible", async () => {
    await expect(
      saveEntry(fx.users.alphaLead, {
        controlItemId: fx.items.A,
        period: "2026-04",
        planVersionId: fx.versions.PRB,
        input: "1",
      }),
    ).rejects.toBeInstanceOf(VersionLockedError);
  });

  it("still serves the locked version's frozen value to a formula", async () => {
    await prisma.planVersion.update({ where: { id: fx.versions.PRB }, data: { lockedAt: null } });
    await setRaw(fx.items.B, "2026-04", fx.versions.PRB, 800);
    await prisma.planVersion.update({ where: { id: fx.versions.PRB }, data: { lockedAt: new Date() } });

    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.C,
      period: "2026-04",
      planVersionId: fx.versions["2QFC"],
      input: `=[CI:${codes.B}][2026-04][PRB] * 1.1`,
    });
    expect(result.value).toBeCloseTo(880, 6);
    expect(result.error).toBeNull();
  });

  it("refuses to save a formula onto a locked version", async () => {
    await expect(
      saveEntry(fx.users.admin, {
        controlItemId: fx.items.C,
        period: "2026-05",
        planVersionId: fx.versions.PRB,
        input: "=1+1",
      }),
    ).rejects.toBeInstanceOf(VersionLockedError);
  });
});

describe("permissions", () => {
  it("lets an OWNER edit a Control Item they are named responsible for", async () => {
    const result = await saveEntry(fx.users.alphaLead, {
      controlItemId: fx.items.A,
      period: "2026-07",
      planVersionId: fx.versions.ACT,
      input: "10",
    });
    expect(result.value).toBe(10);
  });

  it("lets a division lead edit anything whose DIC is their division", async () => {
    const result = await saveEntry(fx.users.alphaLead, {
      controlItemId: fx.items.B,
      period: "2026-07",
      planVersionId: fx.versions.ACT,
      input: "20",
    });
    expect(result.value).toBe(20);
  });

  it("lets a division lead edit a department beneath their division", async () => {
    const result = await saveEntry(fx.users.alphaLead, {
      controlItemId: fx.items.D,
      period: "2026-07",
      planVersionId: fx.versions.ACT,
      input: "30",
    });
    expect(result.value).toBe(30);
  });

  it("refuses an OWNER outside their own division", async () => {
    await expect(
      saveEntry(fx.users.alphaLead, {
        controlItemId: fx.items.C,
        period: "2026-07",
        planVersionId: fx.versions.ACT,
        input: "40",
      }),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });

  it("refuses a VIEWER everywhere", async () => {
    await expect(
      saveEntry(fx.users.viewer, {
        controlItemId: fx.items.A,
        period: "2026-08",
        planVersionId: fx.versions.ACT,
        input: "1",
      }),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });
});

describe("formula cells", () => {
  const V = () => fx.versions["2QFC"];

  it("computes and caches the result", async () => {
    await setRaw(fx.items.A, "2026-09", V(), 200);
    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.B,
      period: "2026-09",
      planVersionId: V(),
      input: `=[CI:${codes.A}][2026-09] * 0.85`,
    });
    expect(result.value).toBeCloseTo(170, 6);

    const stored = await readCell(fx.items.B, "2026-09", V());
    expect(stored.value).toBeCloseTo(170, 6);
    expect(stored.formula).toBe(`=[CI:${codes.A}][2026-09] * 0.85`);
  });

  it("makes raw value and formula mutually exclusive", async () => {
    const entry = await prisma.entry.findUniqueOrThrow({
      where: {
        controlItemId_period_planVersionId: {
          controlItemId: fx.items.B,
          period: new Date(Date.UTC(2026, 8, 1)),
          planVersionId: V(),
        },
      },
    });
    expect(entry.rawValue).toBeNull();
    expect(entry.formula).not.toBeNull();

    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.B,
      period: "2026-09",
      planVersionId: V(),
      input: "99",
    });
    const after = await readCell(fx.items.B, "2026-09", V());
    expect(after.formula).toBeNull();
    expect(after.value).toBe(99);
  });

  it("recomputes a dependent when its upstream cell changes", async () => {
    await setRaw(fx.items.A, "2026-10", V(), 100);
    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.B,
      period: "2026-10",
      planVersionId: V(),
      input: `=[CI:${codes.A}][2026-10] * 2`,
    });
    expect((await readCell(fx.items.B, "2026-10", V())).value).toBe(200);

    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.A,
      period: "2026-10",
      planVersionId: V(),
      input: "150",
    });
    expect(result.recomputed.length).toBeGreaterThan(0);
    expect((await readCell(fx.items.B, "2026-10", V())).value).toBe(300);
  });

  it("recomputes a whole chain in one pass, in dependency order", async () => {
    await setRaw(fx.items.A, "2026-11", V(), 10);
    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.B,
      period: "2026-11",
      planVersionId: V(),
      input: `=[CI:${codes.A}][2026-11] + 5`,
    });
    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.C,
      period: "2026-11",
      planVersionId: V(),
      input: `=[CI:${codes.B}][2026-11] * 3`,
    });
    expect((await readCell(fx.items.C, "2026-11", V())).value).toBe(45);

    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.A,
      period: "2026-11",
      planVersionId: V(),
      input: "20",
    });
    expect((await readCell(fx.items.B, "2026-11", V())).value).toBe(25);
    expect((await readCell(fx.items.C, "2026-11", V())).value).toBe(75);
  });

  it("sums a range across other Control Items", async () => {
    await setRaw(fx.items.A, "2026-04", fx.versions["1QFC"], 1);
    await setRaw(fx.items.A, "2026-05", fx.versions["1QFC"], 2);
    await setRaw(fx.items.A, "2026-06", fx.versions["1QFC"], 3);
    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.C,
      period: "2026-12",
      planVersionId: V(),
      input: `=SUM([CI:${codes.A}][2026-04:2026-06][1QFC])`,
    });
    expect(result.value).toBe(6);
  });

  it("rejects a direct self reference and names the cell", async () => {
    await expect(
      saveEntry(fx.users.admin, {
        controlItemId: fx.items.A,
        period: "2027-01",
        planVersionId: V(),
        input: `=[CI:${codes.A}][2027-01] + 1`,
      }),
    ).rejects.toThrow(/circular reference/);
  });

  it("rejects a two-cell cycle and names both cells involved", async () => {
    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.B,
      period: "2027-02",
      planVersionId: V(),
      input: `=[CI:${codes.A}][2027-02] + 1`,
    });

    let thrown: unknown;
    try {
      await saveEntry(fx.users.admin, {
        controlItemId: fx.items.A,
        period: "2027-02",
        planVersionId: V(),
        input: `=[CI:${codes.B}][2027-02] + 1`,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FormulaError);
    const message = (thrown as FormulaError).message;
    expect(message).toMatch(/circular reference/);
    expect(message).toContain(codes.A);
    expect(message).toContain(codes.B);
    expect(message).toContain("2027-02");
  });

  it("leaves the sheet untouched when a cycle is rejected", async () => {
    const cell = await readCell(fx.items.A, "2027-02", V());
    expect(cell.formula).toBeNull();
  });

  it("stores a typed error for a reference to a Control Item that does not exist", async () => {
    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.C,
      period: "2027-03",
      planVersionId: V(),
      input: "=[CI:NO-SUCH-ITEM][2026-04] + 1",
    });
    expect(result.error).toMatch(/No Control Item with code/);
    const stored = await readCell(fx.items.C, "2027-03", V());
    expect(stored.value).toBeNull();
    expect(stored.error).toMatch(/No Control Item with code/);
  });

  it("stores a typed error for division by zero rather than Infinity", async () => {
    await setRaw(fx.items.A, "2027-03", V(), 0);
    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.B,
      period: "2027-03",
      planVersionId: V(),
      input: `=100 / [CI:${codes.A}][2027-03]`,
    });
    expect(result.error).toMatch(/divides by zero/);
    expect(result.value).toBeNull();
  });

  it("propagates a broken upstream into the dependent, without crashing", async () => {
    await setRaw(fx.items.A, "2026-08", V(), 0);
    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.B,
      period: "2026-08",
      planVersionId: V(),
      input: `=1 / [CI:${codes.A}][2026-08]`,
    });
    const result = await saveEntry(fx.users.admin, {
      controlItemId: fx.items.C,
      period: "2026-08",
      planVersionId: V(),
      input: `=[CI:${codes.B}][2026-08] + 1`,
    });
    expect(result.error).toMatch(/itself in error/);
  });

  it("rejects a formula that does not parse, without writing anything", async () => {
    await expect(
      saveEntry(fx.users.admin, {
        controlItemId: fx.items.C,
        period: "2026-06",
        planVersionId: V(),
        input: "=1 + + )",
      }),
    ).rejects.toBeInstanceOf(FormulaError);
    expect((await readCell(fx.items.C, "2026-06", V())).formula).toBeNull();
  });
});

/**
 * Which cells the sheet offers as keyable, and what it puts in them.
 *
 * The grid draws a box wherever `targetEditable` is true and seeds it from
 * `targetFormula` before `target`, so these two fields are the whole contract
 * between the calculation module and the entry surface. Getting either wrong
 * is silent on screen and destructive underneath: a box drawn over a resolved
 * target would write into a version nobody chose, and a box seeded with a
 * formula's result would replace the formula the moment anyone tabbed past.
 */
describe("keyable cells on the sheet", () => {
  async function monthCell(targetVersionId: string | null, controlItemId = fx.items.A) {
    const model = await loadSheet({ kiId: fx.kiId, levels: [2], targetVersionId });
    const row = model.rows.find(
      (candidate) => candidate.kind === "CONTROL_ITEM" && candidate.id === controlItemId,
    ) as ControlItemRow;
    return row.cells.find((cell) => cell.key === "2026-07")!;
  }

  beforeAll(async () => {
    await setRaw(fx.items.A, "2026-07", fx.versions.OB, 250);
  });

  it("offers no box at all when the target is the latest-forecast resolution", async () => {
    // Unpinned, the column is an answer assembled from several versions. There
    // is no single entry for a keystroke to land in, so nothing is offered.
    const cell = await monthCell(null);
    expect(cell.target).toBe(250);
    expect(cell.targetEditable).toBe(false);
  });

  it("offers a box once a specific unlocked version is pinned", async () => {
    const cell = await monthCell(fx.versions.OB);
    expect(cell.target).toBe(250);
    expect(cell.targetEditable).toBe(true);
  });

  it("offers no box on a locked version, however it is reached", async () => {
    const cell = await monthCell(fx.versions.PRB);
    expect(cell.targetEditable).toBe(false);
  });

  it("never offers a box on a quarter or the Ki total", async () => {
    const model = await loadSheet({
      kiId: fx.kiId,
      levels: [2],
      targetVersionId: fx.versions.OB,
    });
    const row = model.rows.find(
      (candidate) => candidate.kind === "CONTROL_ITEM" && candidate.id === fx.items.A,
    ) as ControlItemRow;
    const derived = row.cells.filter((cell) => cell.kind !== "MONTH");
    expect(derived.length).toBe(5); // four quarters and the Ki total
    expect(derived.every((cell) => cell.targetEditable === false)).toBe(true);
  });

  it("carries a formula back as it was written, not as the number it made", async () => {
    const written = "=[CI:" + codes.B + "][2026-07][OB] + 10";
    await setRaw(fx.items.B, "2026-07", fx.versions.OB, 90);
    await saveEntry(fx.users.admin, {
      controlItemId: fx.items.C,
      period: "2026-07",
      planVersionId: fx.versions.OB,
      input: written,
    });

    const cell = await monthCell(fx.versions.OB, fx.items.C);
    expect(cell.target).toBeCloseTo(100, 6);
    expect(cell.targetFormula).toBe(written);
  });

  it("leaves targetFormula null for a plain number", async () => {
    const cell = await monthCell(fx.versions.OB);
    expect(cell.targetFormula).toBeNull();
  });
});
