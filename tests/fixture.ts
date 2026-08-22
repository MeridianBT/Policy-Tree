/**
 * A disposable Ki for the integration tests: a real database, real Prisma, real
 * server-side permission checks. The unit suites cover the pure logic; these
 * cover the seams that only exist once a database is involved.
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { periodToDate } from "../lib/domain/period.ts";
import type { AuthenticatedUser } from "../lib/auth/types.ts";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

export interface Fixture {
  kiId: string;
  kiCode: string;
  versions: Record<string, string>;
  items: Record<string, string>;
  orgUnits: Record<string, string>;
  users: Record<string, AuthenticatedUser>;
  /** Level 1/2 nodes, for tests exercising the structure-edit actions. */
  nodes: { goal: string; theme: string; objective: string };
  cleanup: () => Promise<void>;
}

let counter = 0;

export async function createFixture(): Promise<Fixture> {
  const suffix = `T${Date.now().toString(36)}${counter++}`;
  const kiCode = `Ki TEST ${suffix}`;

  const company = await prisma.orgUnit.upsert({
    where: { code: `CO-${suffix}` },
    update: {},
    create: { code: `CO-${suffix}`, name: "Test Company", type: "COMPANY" },
  });
  const alpha = await prisma.orgUnit.create({
    data: { code: `ALPHA-${suffix}`, name: "Alpha", type: "DIVISION", parentId: company.id },
  });
  const beta = await prisma.orgUnit.create({
    data: { code: `BETA-${suffix}`, name: "Beta", type: "DIVISION", parentId: company.id },
  });
  const alphaDept = await prisma.orgUnit.create({
    data: { code: `ALPHA-D1-${suffix}`, name: "Alpha Dept", type: "DEPARTMENT", parentId: alpha.id },
  });

  const makeUser = async (
    key: string,
    role: "ADMIN" | "OWNER" | "VIEWER",
    orgUnitId: string | null,
  ): Promise<AuthenticatedUser> => {
    const record = await prisma.appUser.create({
      data: {
        name: `${key} ${suffix}`,
        email: `${key}.${suffix}@test.local`.toLowerCase(),
        passwordHash: "x",
        role,
        orgUnitId,
      },
    });
    return {
      id: record.id,
      name: record.name,
      email: record.email,
      role,
      orgUnitId,
      orgUnitCode: null,
    };
  };

  const users = {
    admin: await makeUser("admin", "ADMIN", company.id),
    alphaLead: await makeUser("alpha-lead", "OWNER", alpha.id),
    betaLead: await makeUser("beta-lead", "OWNER", beta.id),
    viewer: await makeUser("viewer", "VIEWER", company.id),
  };

  const ki = await prisma.ki.create({
    data: {
      code: kiCode,
      startDate: new Date(Date.UTC(2026, 3, 1)),
      endDate: new Date(Date.UTC(2027, 2, 31)),
      isCurrent: false,
    },
  });

  const versionSpecs = [
    { code: "OB", label: "Original Budget", sequence: 1, isActual: false, lockedAt: null },
    { code: "PRB", label: "Press Release Budget", sequence: 2, isActual: false, lockedAt: new Date() },
    { code: "1QFC", label: "1st Quarter Forecast", sequence: 3, isActual: false, lockedAt: null },
    { code: "2QFC", label: "2nd Quarter Forecast", sequence: 4, isActual: false, lockedAt: null },
    { code: "ACT", label: "Actual", sequence: 99, isActual: true, lockedAt: null },
  ];
  const versions: Record<string, string> = {};
  for (const spec of versionSpecs) {
    const created = await prisma.planVersion.create({ data: { ...spec, kiId: ki.id } });
    versions[spec.code] = created.id;
  }

  const goal = await prisma.node.create({
    data: { kiId: ki.id, level: 1, kind: "GOAL", statement: "Test goal", orgUnitId: company.id },
  });
  const theme = await prisma.node.create({
    data: { kiId: ki.id, parentId: goal.id, level: 2, kind: "THEME", statement: "Test theme" },
  });
  const objective = await prisma.node.create({
    data: { kiId: ki.id, parentId: theme.id, level: 2, kind: "OBJECTIVE", statement: "Test objective" },
  });

  const itemSpecs = [
    { key: "A", dic: alpha.id, responsible: users.alphaLead.id },
    { key: "B", dic: alpha.id, responsible: null },
    { key: "C", dic: beta.id, responsible: null },
    { key: "D", dic: alphaDept.id, responsible: null },
  ];
  const items: Record<string, string> = {};
  for (const [index, spec] of itemSpecs.entries()) {
    const item = await prisma.controlItem.create({
      data: {
        nodeId: objective.id,
        code: `${spec.key}-${suffix}`,
        name: `Item ${spec.key}`,
        unit: "COUNT",
        direction: "HIGHER_BETTER",
        achievementMethod: "RATIO",
        aggregation: "SUM",
        decimalPlaces: 2,
        dicOrgUnitId: spec.dic,
        responsibleUserId: spec.responsible,
        sortOrder: index,
      },
    });
    items[spec.key] = item.id;
  }

  return {
    kiId: ki.id,
    kiCode,
    versions,
    items,
    orgUnits: { company: company.id, alpha: alpha.id, beta: beta.id, alphaDept: alphaDept.id },
    users,
    nodes: { goal: goal.id, theme: theme.id, objective: objective.id },
    async cleanup() {
      await prisma.ki.delete({ where: { id: ki.id } });
      await prisma.appUser.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
      await prisma.orgUnit.deleteMany({
        where: { id: { in: [alphaDept.id, alpha.id, beta.id, company.id] } },
      });
    },
  };
}

/** Item codes as a formula addresses them. */
export async function codeOf(controlItemId: string): Promise<string> {
  const item = await prisma.controlItem.findUniqueOrThrow({
    where: { id: controlItemId },
    select: { code: true },
  });
  return item.code;
}

export async function setRaw(
  controlItemId: string,
  period: string,
  planVersionId: string,
  value: number | null,
): Promise<string> {
  const entry = await prisma.entry.upsert({
    where: {
      controlItemId_period_planVersionId: {
        controlItemId,
        period: periodToDate(period),
        planVersionId,
      },
    },
    update: { rawValue: value, formula: null, computedValue: null, errorCode: null, errorMessage: null },
    create: { controlItemId, period: periodToDate(period), planVersionId, rawValue: value },
  });
  return entry.id;
}

export async function readCell(
  controlItemId: string,
  period: string,
  planVersionId: string,
): Promise<{ value: number | null; formula: string | null; error: string | null }> {
  const entry = await prisma.entry.findUnique({
    where: {
      controlItemId_period_planVersionId: {
        controlItemId,
        period: periodToDate(period),
        planVersionId,
      },
    },
  });
  if (!entry) return { value: null, formula: null, error: null };
  const stored = entry.formula ? entry.computedValue : entry.rawValue;
  return {
    value: stored === null || stored === undefined ? null : Number(stored),
    formula: entry.formula,
    error: entry.errorMessage,
  };
}
