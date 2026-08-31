/**
 * Seeds one Ki with the six divisions, the version set, the evaluation bands,
 * the Level 1-3 structure and its Control Items, one Level 4 division sheet,
 * PRB targets for the whole year and actuals through the first half.
 *
 * Idempotent: re-running replaces the seeded Ki rather than duplicating it.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { kiMonths, periodToDate, fiscalMonthIndex } from "../lib/domain/period.ts";
import { DEFAULT_BANDS } from "../lib/calc/bands.ts";
import {
  DEPARTMENTS,
  DIVISIONS,
  GOALS,
  LEVEL_4,
  PLAN_VERSIONS,
  type SeedControlItem,
} from "./seed-data.ts";

const KI_START_YEAR = 2026;
// Deliberately NOT the derived numbered code (kiCode() in lib/domain/period).
// That numbering is one company's fiscal convention, and the UAT dataset
// already occupies 103KI under it. This is a generic worked example for six
// invented divisions, so it keeps a calendar name of its own - which also
// stops `db:seed` from finding the UAT year by code and replacing it.
const KI_CODE = `Ki ${KI_START_YEAR}`;

/**
 * The worked example predates the business unit dimension and is all one
 * product line, so every measure in it is filed under Automobiles. The four
 * units themselves are created by the migration, not here - they are
 * reference data the schema depends on, not seed content.
 */
let businessUnitIds: Record<string, string> = {};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Deterministic pseudo-random in [0,1) so that re-seeding produces the same
 * sheet and screenshots stay comparable between runs.
 */
function noise(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}


/**
 * The four business units are reference data created by the migration, not
 * seed content, so this resolves them by code and fails loudly if the schema
 * has not been migrated. A silent default here would file every measure under
 * whichever unit happened to sort first.
 */
async function businessUnitsByCode(): Promise<Record<string, string>> {
  const rows = await prisma.businessUnit.findMany({ select: { id: true, code: true } });
  if (rows.length === 0) {
    throw new Error("No business units found. Run `prisma migrate deploy` first.");
  }
  return Object.fromEntries(rows.map((row) => [row.code, row.id]));
}

async function main() {
  businessUnitIds = await businessUnitsByCode();
  console.log("Seeding Hoshin Kanri…");

  // ---- Evaluation bands -------------------------------------------------
  await prisma.evaluationBand.deleteMany({});
  for (const band of DEFAULT_BANDS) {
    await prisma.evaluationBand.create({ data: band });
  }
  console.log(`  evaluation bands: ${DEFAULT_BANDS.length}`);

  // ---- Org units --------------------------------------------------------
  const company = await prisma.orgUnit.upsert({
    where: { code: "CO" },
    update: {},
    create: { code: "CO", name: "Company", type: "COMPANY", sortOrder: 0 },
  });

  const divisionByCode = new Map<string, { id: string }>();
  for (const [index, division] of DIVISIONS.entries()) {
    const record = await prisma.orgUnit.upsert({
      where: { code: division.code },
      update: { name: division.name, parentId: company.id, sortOrder: index + 1 },
      create: {
        code: division.code,
        name: division.name,
        type: "DIVISION",
        parentId: company.id,
        sortOrder: index + 1,
      },
    });
    divisionByCode.set(division.code, record);
  }
  // Departments sit beneath a Division; a Level 4 branch may be filed against
  // either, which is what the Division/Department filter narrows between.
  const orgUnitByCode = new Map(divisionByCode);
  for (const [index, department] of DEPARTMENTS.entries()) {
    const parent = divisionByCode.get(department.division);
    if (!parent) throw new Error(`Unknown division ${department.division}`);
    const record = await prisma.orgUnit.upsert({
      where: { code: department.code },
      update: { name: department.name, parentId: parent.id, sortOrder: index },
      create: {
        code: department.code,
        name: department.name,
        type: "DEPARTMENT",
        parentId: parent.id,
        sortOrder: index,
      },
    });
    orgUnitByCode.set(department.code, record);
  }
  console.log(
    `  org units: company + ${DIVISIONS.length} divisions + ${DEPARTMENTS.length} departments`,
  );

  // ---- Users ------------------------------------------------------------
  const passwordHash = await bcrypt.hash("hoshin", 10);
  const users = [
    { email: "admin@example.com", name: "Admin User", role: "SUPER_ADMIN" as const, org: null },
    { email: "auto.lead@example.com", name: "Auto Division Lead", role: "OWNER" as const, org: "AUTO" },
    { email: "ox.lead@example.com", name: "OX Division Lead", role: "OWNER" as const, org: "OX" },
    { email: "cs.lead@example.com", name: "CS Division Lead", role: "OWNER" as const, org: "CS" },
    { email: "frc.lead@example.com", name: "FRC Division Lead", role: "OWNER" as const, org: "FRC" },
    // Department leads: same OWNER role, but scoped to a single department, so
    // their reach is narrower than the division lead above them.
    { email: "assembly.lead@example.com", name: "Final Assembly Lead", role: "OWNER" as const, org: "OX-ASSY" },
    { email: "dealer.lead@example.com", name: "Dealer Sales Lead", role: "OWNER" as const, org: "AUTO-SALES" },
    { email: "viewer@example.com", name: "Review Attendee", role: "VIEWER" as const, org: null },
  ];
  const userByOrg = new Map<string, string>();
  for (const user of users) {
    const record = await prisma.appUser.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        orgUnitId: user.org ? orgUnitByCode.get(user.org)!.id : company.id,
      },
    });
    if (user.org) userByOrg.set(user.org, record.id);
  }
  console.log(`  users: ${users.length} (password for all: "hoshin")`);

  // ---- Ki ---------------------------------------------------------------
  await prisma.ki.deleteMany({ where: { code: KI_CODE } });
  await prisma.ki.updateMany({ data: { isCurrent: false } });
  const ki = await prisma.ki.create({
    data: {
      code: KI_CODE,
      startDate: new Date(Date.UTC(KI_START_YEAR, 3, 1)),
      endDate: new Date(Date.UTC(KI_START_YEAR + 1, 2, 31)),
      isCurrent: true,
    },
  });

  const versionByCode = new Map<string, { id: string; sequence: number }>();
  for (const version of PLAN_VERSIONS) {
    const record = await prisma.planVersion.create({
      data: {
        kiId: ki.id,
        code: version.code,
        label: version.label,
        sequence: version.sequence,
        isActual: version.isActual,
        // The Ki is mid-way through 2QFC: everything up to 1QFC is closed.
        lockedAt:
          version.code === "OB" || version.code === "PRB" || version.code === "1QFC"
            ? new Date(Date.UTC(KI_START_YEAR, 6, 15))
            : null,
      },
    });
    versionByCode.set(version.code, record);
  }
  console.log(`  ${KI_CODE}: ${PLAN_VERSIONS.length} plan versions`);

  // ---- Level 1-3 structure ---------------------------------------------
  const months = kiMonths(KI_START_YEAR);
  const controlItemIdByCode = new Map<string, string>();
  const objectiveNodeByControlItem = new Map<string, string>();
  let controlItemCount = 0;
  let entryCount = 0;

  /*
   * One Objective per seeded measure.
   *
   * The tree is flat: a measure's name *is* the Objective statement, and the
   * Objective carries the Control Item that records it. An Objective held to
   * several Control Items is what the model allows; the demo plan does not
   * need one to make its point.
   */
  async function createObjective(
    parentId: string,
    level: number,
    spec: SeedControlItem,
    sortOrder: number,
    orgUnitId: string,
    /** Files the measure against a Department rather than its Division. */
    dicCode?: string,
  ): Promise<string> {
    const dic = dicCode ?? spec.dic;
    const node = await prisma.node.create({
      data: {
        kiId: ki.id,
        parentId,
        level,
        kind: "OBJECTIVE",
        statement: spec.name,
        orgUnitId,
        sortOrder,
      },
    });
    const controlItem = await prisma.controlItem.create({
      data: {
        nodeId: node.id,
        code: spec.code,
        measuredAs: spec.measuredAs,
        unit: spec.unit,
        direction: spec.direction,
        achievementMethod: spec.achievementMethod,
        aggregation: spec.aggregation,
        decimalPlaces: spec.decimalPlaces,
        businessUnitId: businessUnitIds.AUTO,
        dicOrgUnitId: orgUnitByCode.get(dic)!.id,
        responsibleUserId: userByOrg.get(dic) ?? userByOrg.get(spec.dic) ?? null,
        sortOrder: 0,
      },
    });
    controlItemIdByCode.set(spec.code, controlItem.id);
    objectiveNodeByControlItem.set(spec.code, node.id);
    controlItemCount++;
    entryCount += await seedEntries(controlItem.id, spec);
    return node.id;
  }

  async function seedEntries(controlItemId: string, spec: SeedControlItem): Promise<number> {
    const rows: Array<{
      controlItemId: string;
      period: Date;
      planVersionId: string;
      rawValue: number;
    }> = [];

    for (const period of months) {
      const index = fiscalMonthIndex(period);
      // Original budget sits a little below the committed press-release budget.
      const ob = spec.monthlyTarget * 0.97;
      const prb = spec.monthlyTarget;
      rows.push({ controlItemId, period: periodToDate(period), planVersionId: versionByCode.get("OB")!.id, rawValue: round(ob, spec.decimalPlaces) });
      rows.push({ controlItemId, period: periodToDate(period), planVersionId: versionByCode.get("PRB")!.id, rawValue: round(prb, spec.decimalPlaces) });

      // 1QFC revised Q2-Q4 after the Q1 review; 2QFC revised Q3-Q4.
      if (index >= 3) {
        const revision = 1 + (noise(`${spec.code}-1qfc`) - 0.5) * 0.08;
        rows.push({
          controlItemId,
          period: periodToDate(period),
          planVersionId: versionByCode.get("1QFC")!.id,
          rawValue: round(prb * revision, spec.decimalPlaces),
        });
      }
      if (index >= 6) {
        const revision = 1 + (noise(`${spec.code}-2qfc`) - 0.5) * 0.1;
        rows.push({
          controlItemId,
          period: periodToDate(period),
          planVersionId: versionByCode.get("2QFC")!.id,
          rawValue: round(prb * revision, spec.decimalPlaces),
        });
      }

      // Actuals are keyed through the first half of the Ki (Apr-Sep).
      if (index <= 5) {
        const swing = 1 + (noise(`${spec.code}-act-${period}`) - 0.45) * 0.28;
        rows.push({
          controlItemId,
          period: periodToDate(period),
          planVersionId: versionByCode.get("ACT")!.id,
          rawValue: round(prb * swing, spec.decimalPlaces),
        });
      }
    }

    await prisma.entry.createMany({ data: rows });
    return rows.length;
  }

  let goalOrder = 0;
  for (const goal of GOALS) {
    const goalNode = await prisma.node.create({
      data: {
        kiId: ki.id,
        level: 1,
        kind: "GOAL",
        statement: goal.statement,
        orgUnitId: company.id,
        sortOrder: goalOrder++,
      },
    });

    /*
     * The plan is drafted in seed-data.ts as Goal > Theme > Objective >
     * measures, which is how somebody writes one down. The tree it seeds is
     * flat: a Goal, then an Objective per measure.
     *
     * A Theme's and an Objective's statements are therefore not nodes - each
     * measure's own name is the Objective statement - and the drafted nesting
     * survives only to say which company Objective a Level 3 branch hangs
     * from. That parent is the FIRST measure of the objective it was drafted
     * under, the same rule the flatten migration applied to live data.
     */
    let order = 0;
    for (const theme of goal.themes) {
      for (const objective of theme.objectives) {
        let first: string | null = null;
        for (const spec of objective.controlItems) {
          const id = await createObjective(goalNode.id, 2, spec, order++, company.id);
          first ??= id;
        }
        if (!first) continue;

        let childOrder = 0;
        for (const child of objective.children ?? []) {
          for (const spec of child.controlItems) {
            await createObjective(first, 3, spec, childOrder++, company.id);
          }
        }
      }
    }
  }

  // ---- Level 4 division sheets -----------------------------------------
  for (const [divisionIndex, level4] of LEVEL_4.entries()) {
    // A branch belongs to its Department when one is named, otherwise to the
    // Division itself - both are valid places for Level 4 work to sit.
    const orgUnitId = orgUnitByCode.get(level4.department ?? level4.division)!.id;
    for (const [objectiveIndex, objective] of level4.objectives.entries()) {
      const parentObjectiveId = objectiveNodeByControlItem.get(objective.laddersToControlItem);
      if (!parentObjectiveId) throw new Error(`Unknown ladder target ${objective.laddersToControlItem}`);

      for (const [index, spec] of objective.controlItems.entries()) {
        await createObjective(
          parentObjectiveId,
          4,
          spec,
          divisionIndex * 100 + objectiveIndex * 10 + index,
          orgUnitId,
          level4.department,
        );
      }
    }
  }

  console.log(`  control items: ${controlItemCount}`);
  console.log(`  entries: ${entryCount}`);
  console.log("Done.");
}

function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
