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
import { DIVISIONS, GOALS, LEVEL_4, PLAN_VERSIONS, type SeedControlItem } from "./seed-data.ts";

const KI_START_YEAR = 2026;
const KI_CODE = `Ki ${KI_START_YEAR}`;

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

async function main() {
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
  console.log(`  org units: company + ${DIVISIONS.length} divisions`);

  // ---- Users ------------------------------------------------------------
  const passwordHash = await bcrypt.hash("hoshin", 10);
  const users = [
    { email: "admin@example.com", name: "Admin User", role: "ADMIN" as const, org: null },
    { email: "auto.lead@example.com", name: "Auto Division Lead", role: "OWNER" as const, org: "AUTO" },
    { email: "ox.lead@example.com", name: "OX Division Lead", role: "OWNER" as const, org: "OX" },
    { email: "cs.lead@example.com", name: "CS Division Lead", role: "OWNER" as const, org: "CS" },
    { email: "frc.lead@example.com", name: "FRC Division Lead", role: "OWNER" as const, org: "FRC" },
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
        orgUnitId: user.org ? divisionByCode.get(user.org)!.id : company.id,
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

  async function createControlItem(
    nodeId: string,
    spec: SeedControlItem,
    sortOrder: number,
  ): Promise<void> {
    const controlItem = await prisma.controlItem.create({
      data: {
        nodeId,
        code: spec.code,
        name: spec.name,
        unit: spec.unit,
        direction: spec.direction,
        achievementMethod: spec.achievementMethod,
        aggregation: spec.aggregation,
        decimalPlaces: spec.decimalPlaces,
        dicOrgUnitId: divisionByCode.get(spec.dic)!.id,
        responsibleUserId: userByOrg.get(spec.dic) ?? null,
        sortOrder,
      },
    });
    controlItemIdByCode.set(spec.code, controlItem.id);
    objectiveNodeByControlItem.set(spec.code, nodeId);
    controlItemCount++;
    entryCount += await seedEntries(controlItem.id, spec);
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

    let themeOrder = 0;
    for (const theme of goal.themes) {
      const themeNode = await prisma.node.create({
        data: {
          kiId: ki.id,
          parentId: goalNode.id,
          level: 2,
          kind: "THEME",
          statement: theme.statement,
          orgUnitId: company.id,
          sortOrder: themeOrder++,
        },
      });

      let objectiveOrder = 0;
      for (const objective of theme.objectives) {
        const objectiveNode = await prisma.node.create({
          data: {
            kiId: ki.id,
            parentId: themeNode.id,
            level: 2,
            kind: "OBJECTIVE",
            statement: objective.statement,
            orgUnitId: company.id,
            sortOrder: objectiveOrder++,
          },
        });
        for (const [index, spec] of objective.controlItems.entries()) {
          await createControlItem(objectiveNode.id, spec, index);
        }

        // Level 3 sits under a Level 3 theme that hangs off the Level 2 objective.
        if (objective.children?.length) {
          const level3Theme = await prisma.node.create({
            data: {
              kiId: ki.id,
              parentId: objectiveNode.id,
              level: 3,
              kind: "THEME",
              statement: objective.childTheme ?? `${theme.statement} — deployment`,
              orgUnitId: company.id,
              sortOrder: 0,
            },
          });
          let childOrder = 0;
          for (const child of objective.children) {
            const childNode = await prisma.node.create({
              data: {
                kiId: ki.id,
                parentId: level3Theme.id,
                level: 3,
                kind: "OBJECTIVE",
                statement: child.statement,
                orgUnitId: company.id,
                sortOrder: childOrder++,
              },
            });
            for (const [index, spec] of child.controlItems.entries()) {
              await createControlItem(childNode.id, spec, index);
            }
          }
        }
      }
    }
  }

  // ---- Level 4 division sheets -----------------------------------------
  for (const [divisionIndex, level4] of LEVEL_4.entries()) {
    const orgUnitId = divisionByCode.get(level4.division)!.id;
    for (const [objectiveIndex, objective] of level4.objectives.entries()) {
      const parentObjectiveId = objectiveNodeByControlItem.get(objective.laddersToControlItem);
      if (!parentObjectiveId) throw new Error(`Unknown ladder target ${objective.laddersToControlItem}`);

      const themeNode = await prisma.node.create({
        data: {
          kiId: ki.id,
          parentId: parentObjectiveId,
          level: 4,
          kind: "THEME",
          statement: level4.theme,
          orgUnitId,
          sortOrder: divisionIndex,
        },
      });
      const objectiveNode = await prisma.node.create({
        data: {
          kiId: ki.id,
          parentId: themeNode.id,
          level: 4,
          kind: "OBJECTIVE",
          statement: objective.statement,
          orgUnitId,
          sortOrder: objectiveIndex,
        },
      });
      for (const [index, spec] of objective.controlItems.entries()) {
        await createControlItem(objectiveNode.id, spec, index);
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
