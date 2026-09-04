/**
 * Writing down why a measure means what it means, against a real database.
 *
 * Two things are being defended here. The permission rule, which decides
 * whether a division lead may write against somebody else's measure - the same
 * risk the structure tests exist for. And the append-only rule, which is the
 * whole reason the record is worth anything in a dispute: nothing may be
 * updated, a revision has to leave what it revised readable, and a withdrawal
 * has to leave a row behind.
 *
 * The session boundary is mocked the way tests/structure.test.ts mocks it, so
 * `canEditControlItem` and `canEditInKi` stay real and run against real
 * Postgres.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixture, prisma, type Fixture } from "./fixture";
import type { AuthenticatedUser } from "@/lib/auth/types";

let currentUser: AuthenticatedUser;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/session", async () => {
  const permissions = await import("@/lib/auth/permissions");
  const errors = await import("@/lib/auth/errors");
  return {
    ...permissions,
    ...errors,
    requireSession: async () => currentUser,
    requireRole: async (...roles: string[]) => {
      if (!roles.includes(currentUser.role)) {
        throw new errors.NotPermittedError(`This action needs the ${roles.join(" or ")} role.`);
      }
      return currentUser;
    },
  };
});

const { addNote, withdrawNote } = await import("@/lib/rationale/actions");
const { loadNotes } = await import("@/lib/rationale/query");
const { latestDefinition, rationaleLog } = await import("@/lib/rationale/notes");
const { copyStructure } = await import("@/lib/admin/actions");

let fx: Fixture;

function asUser(user: AuthenticatedUser) {
  currentUser = user;
}

beforeAll(async () => {
  fx = await createFixture();
});

afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

beforeEach(async () => {
  asUser(fx.users.admin);
  await prisma.controlItemNote.deleteMany({
    where: { controlItem: { node: { kiId: fx.kiId } } },
  });
});

describe("who may write", () => {
  it("lets a super admin write against any measure", async () => {
    const result = await addNote({
      controlItemId: fx.items.C,
      kind: "DEFINITION",
      body: "Counted at invoice.",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a VIEWER outright", async () => {
    asUser(fx.users.viewer);
    const result = await addNote({
      controlItemId: fx.items.A,
      kind: "DEFINITION",
      body: "Should not land.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/responsible|department/i);
  });

  it("lets an OWNER write against a measure in their own org unit", async () => {
    asUser(fx.users.alphaLead);
    const result = await addNote({
      controlItemId: fx.items.B,
      kind: "RATIONALE",
      body: "Set from last year plus the new line.",
      planVersionId: fx.versions.OB,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses an OWNER writing against another division's measure", async () => {
    asUser(fx.users.alphaLead);
    const result = await addNote({
      controlItemId: fx.items.C,
      kind: "DEFINITION",
      body: "Not mine to define.",
    });
    expect(result.ok).toBe(false);
  });
});

describe("nothing is ever updated", () => {
  it("keeps the old definition readable when a new one is written", async () => {
    await addNote({ controlItemId: fx.items.A, kind: "DEFINITION", body: "Excluding fleet." });
    await addNote({ controlItemId: fx.items.A, kind: "DEFINITION", body: "Including fleet." });

    const notes = (await loadNotes([fx.items.A])).get(fx.items.A) ?? [];
    expect(notes).toHaveLength(2);
    expect(latestDefinition(notes)?.body).toBe("Including fleet.");
  });

  it("adds a rationale rather than replacing the one before it", async () => {
    await addNote({
      controlItemId: fx.items.A,
      kind: "RATIONALE",
      body: "Set at 1,240.",
      planVersionId: fx.versions.OB,
    });
    await addNote({
      controlItemId: fx.items.A,
      kind: "RATIONALE",
      body: "Cut to 1,180 - line 2 slipped.",
      planVersionId: fx.versions["2QFC"] ?? fx.versions.OB,
    });

    const notes = (await loadNotes([fx.items.A])).get(fx.items.A) ?? [];
    expect(rationaleLog(notes)).toHaveLength(2);
  });

  it("withdraws by marking, never by deleting", async () => {
    const written = await addNote({
      controlItemId: fx.items.A,
      kind: "DEFINITION",
      body: "Typed against the wrong row.",
    });
    expect(written.ok && written.id).toBeTruthy();
    if (!written.ok || !written.id) return;

    const result = await withdrawNote({ noteId: written.id });
    expect(result.ok).toBe(true);

    const row = await prisma.controlItemNote.findUnique({ where: { id: written.id } });
    expect(row).not.toBeNull();
    expect(row?.retractedAt).not.toBeNull();

    const notes = (await loadNotes([fx.items.A])).get(fx.items.A) ?? [];
    expect(latestDefinition(notes)).toBeNull();
  });

  it("refuses to withdraw somebody else's note", async () => {
    const written = await addNote({
      controlItemId: fx.items.A,
      kind: "RATIONALE",
      body: "The admin's reasoning.",
    });
    if (!written.ok || !written.id) throw new Error("setup failed");

    asUser(fx.users.alphaLead);
    const result = await withdrawNote({ noteId: written.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/wrote/i);
  });
});

describe("what a lock does and does not stop", () => {
  /*
   * The lock exists so a closed figure cannot be rewritten. A note is not a
   * figure, and writing down after the fact why OB was set the way it was is
   * the case this table exists for - refusing it would leave the years that
   * matter most as the ones nothing can be said about.
   */
  it("accepts a rationale against a locked version", async () => {
    await prisma.planVersion.update({
      where: { id: fx.versions.OB },
      data: { lockedAt: new Date() },
    });
    try {
      const result = await addNote({
        controlItemId: fx.items.A,
        kind: "RATIONALE",
        body: "Written up after OB closed.",
        planVersionId: fx.versions.OB,
      });
      expect(result.ok).toBe(true);
    } finally {
      await prisma.planVersion.update({ where: { id: fx.versions.OB }, data: { lockedAt: null } });
    }
  });

  it("refuses a version belonging to another year", async () => {
    const other = await prisma.ki.findFirst({ where: { id: { not: fx.kiId } } });
    if (!other) return;
    const foreign = await prisma.planVersion.findFirst({ where: { kiId: other.id } });
    if (!foreign) return;

    const result = await addNote({
      controlItemId: fx.items.A,
      kind: "RATIONALE",
      body: "Wrong year's version.",
      planVersionId: foreign.id,
    });
    expect(result.ok).toBe(false);
  });

  it("stores no version against a definition, even when one is passed", async () => {
    // A definition is about the measure, not about any one set of targets.
    const written = await addNote({
      controlItemId: fx.items.A,
      kind: "DEFINITION",
      body: "Counted at despatch.",
      planVersionId: fx.versions.OB,
    });
    if (!written.ok || !written.id) throw new Error("setup failed");

    const row = await prisma.controlItemNote.findUniqueOrThrow({ where: { id: written.id } });
    expect(row.planVersionId).toBeNull();
  });
});

describe("opening next year", () => {
  it("carries the definition forward and leaves the rationale behind", async () => {
    await addNote({
      controlItemId: fx.items.A,
      kind: "DEFINITION",
      body: "Retail units invoiced, net of cancellations.",
    });
    await addNote({
      controlItemId: fx.items.A,
      kind: "RATIONALE",
      body: "This year's reasoning, which is about this year's numbers.",
      planVersionId: fx.versions.OB,
    });

    const nextKi = await prisma.ki.create({
      data: {
        code: `${fx.kiCode} NEXT`,
        startDate: new Date("2027-04-01"),
        endDate: new Date("2028-03-31"),
      },
    });
    try {
      const result = await copyStructure(fx.kiId, nextKi.id);
      expect(result.ok).toBe(true);

      const copied = await prisma.controlItemNote.findMany({
        where: { controlItem: { node: { kiId: nextKi.id } } },
      });
      expect(copied.every((note) => note.kind === "DEFINITION")).toBe(true);
      expect(copied.some((note) => note.body.startsWith("Retail units invoiced"))).toBe(true);
      expect(copied.some((note) => note.kind === "RATIONALE")).toBe(false);
    } finally {
      await prisma.ki.delete({ where: { id: nextKi.id } });
    }
  });
});
