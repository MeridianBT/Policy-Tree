/**
 * Emptying a year.
 *
 * The rules worth pinning are the ones that stop an accident: the current Ki
 * cannot be emptied at all, nothing happens without the year's own code typed
 * back, and when it does happen it takes the whole plan with it while leaving
 * the year itself usable.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./fixture";
import { PLAN_VERSIONS } from "../prisma/seed-data";

// revalidatePath needs a Next request context these tests do not have.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/session", async () => {
  const permissions = await import("@/lib/auth/permissions");
  const errors = await import("@/lib/auth/errors");
  const admin = { id: "admin", name: "Admin", email: "a@t.local", role: "SUPER_ADMIN" as const, orgUnitId: null, orgUnitCode: null };
  return {
    ...permissions,
    ...errors,
    requireRole: async () => admin,
    requireSession: async () => admin,
    getCurrentUser: async () => admin,
  };
});

const { resetKi, kiResetImpact } = await import("@/lib/admin/actions");

const suffix = `R${Date.now().toString(36)}`;
let draftKiId: string;
let liveKiId: string;
let orgUnitId: string;

beforeAll(async () => {
  const org = await prisma.orgUnit.create({
    data: { code: `RST-${suffix}`, name: "Reset Co", type: "COMPANY" },
  });
  orgUnitId = org.id;

  const mk = async (code: string, isCurrent: boolean) => {
    const ki = await prisma.ki.create({
      data: {
        code,
        startDate: new Date(Date.UTC(2040, 3, 1)),
        endDate: new Date(Date.UTC(2041, 2, 31)),
        isCurrent,
      },
    });
    await prisma.planVersion.createMany({
      data: PLAN_VERSIONS.map((v) => ({ ...v, kiId: ki.id })),
    });
    return ki.id;
  };

  draftKiId = await mk(`DRAFT-${suffix}`, false);
  liveKiId = await mk(`LIVE-${suffix}`, true);

  // A small plan with one figure keyed against it.
  const goal = await prisma.node.create({
    data: { kiId: draftKiId, level: 1, kind: "GOAL", statement: "Goal", orgUnitId },
  });
  const objective = await prisma.node.create({
    data: { kiId: draftKiId, parentId: goal.id, level: 2, kind: "OBJECTIVE", statement: "Obj", orgUnitId },
  });
  const item = await prisma.controlItem.create({
    data: {
      nodeId: objective.id,
      businessUnitId: (await prisma.businessUnit.findUniqueOrThrow({ where: { code: "AUTO" } })).id,
      code: `RST-CI-${suffix}`,
      name: "Measure",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      achievementMethod: "RATIO",
      aggregation: "SUM",
      dicOrgUnitId: orgUnitId,
    },
  });
  const act = await prisma.planVersion.findFirstOrThrow({ where: { kiId: draftKiId, isActual: true } });
  await prisma.entry.create({
    data: {
      controlItemId: item.id,
      period: new Date(Date.UTC(2040, 3, 1)),
      planVersionId: act.id,
      rawValue: 42,
    },
  });
});

afterAll(async () => {
  for (const id of [draftKiId, liveKiId]) {
    await prisma.node.deleteMany({ where: { kiId: id } });
    await prisma.planVersion.deleteMany({ where: { kiId: id } });
    await prisma.ki.deleteMany({ where: { id } });
  }
  await prisma.orgUnit.deleteMany({ where: { id: orgUnitId } });
  await prisma.$disconnect();
});

describe("resetKi", () => {
  it("counts what would be lost before touching anything", async () => {
    const impact = await kiResetImpact(draftKiId);
    expect(impact).toMatchObject({ nodes: 2, controlItems: 1, entries: 1 });
    // Still all there — asking is not doing.
    expect(await prisma.node.count({ where: { kiId: draftKiId } })).toBe(2);
  });

  it("refuses without the confirmation, and reports the impact instead", async () => {
    const result = await resetKi(draftKiId);
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("needsConfirmation", true);
    expect(await prisma.node.count({ where: { kiId: draftKiId } })).toBe(2);
  });

  it("refuses a wrong confirmation", async () => {
    const result = await resetKi(draftKiId, "not-the-code");
    expect(result).toHaveProperty("needsConfirmation", true);
    expect(await prisma.node.count({ where: { kiId: draftKiId } })).toBe(2);
  });

  it("refuses the current Ki outright, even with the right code typed", async () => {
    const live = await prisma.ki.findUniqueOrThrow({ where: { id: liveKiId } });
    const result = await resetKi(liveKiId, live.code);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("needsConfirmation");
    expect((result as { message: string }).message).toContain("current Ki");
  });

  it("empties the plan when the code matches, and takes the figures with it", async () => {
    const ki = await prisma.ki.findUniqueOrThrow({ where: { id: draftKiId } });
    const result = await resetKi(draftKiId, ki.code);
    expect(result.ok).toBe(true);

    expect(await prisma.node.count({ where: { kiId: draftKiId } })).toBe(0);
    expect(await prisma.controlItem.count({ where: { node: { kiId: draftKiId } } })).toBe(0);
    expect(await prisma.entry.count({ where: { controlItem: { node: { kiId: draftKiId } } } })).toBe(0);
  });

  it("leaves the year itself and its plan versions usable", async () => {
    expect(await prisma.ki.count({ where: { id: draftKiId } })).toBe(1);
    expect(await prisma.planVersion.count({ where: { kiId: draftKiId } })).toBe(PLAN_VERSIONS.length);
  });

  it("tolerates the whitespace a person types around the code", async () => {
    // Nothing left to delete, but the confirmation must still be accepted.
    const ki = await prisma.ki.findUniqueOrThrow({ where: { id: draftKiId } });
    expect((await resetKi(draftKiId, `  ${ki.code}  `)).ok).toBe(true);
  });
});
