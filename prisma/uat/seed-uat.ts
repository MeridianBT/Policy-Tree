/**
 * Loads the UAT dataset: a fictitious Australian automotive distributor, its
 * org structure, its people, and two fiscal years — 103KI running now with
 * four months of actuals keyed, and 104KI created empty so the multi-year
 * workflow can be demonstrated.
 *
 *   npm run db:seed:uat
 *
 * Additive and idempotent. It leaves any other Ki alone but makes 103KI
 * current, so the demo opens on it. Re-running replaces the two Ki rather
 * than duplicating them.
 */

import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PLAN_VERSIONS } from "../seed-data.ts";
import { DEFAULT_BANDS } from "../../lib/calc/bands.ts";
import { DIVISIONS, DEPARTMENTS, PEOPLE, type Item, type Objective } from "./plan.ts";
import { GOALS } from "./goals.ts";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** 103KI runs Apr 2026 - Mar 2027; 104KI is the year after. */
const KI = { current: { code: "103KI", startYear: 2026 }, next: { code: "104KI", startYear: 2027 } };
const MONTHS_KEYED = 4; // April to July 2026

const month = (startYear: number, index: number) => {
  const m = ((3 + index) % 12) + 1;
  const y = m >= 4 ? startYear : startYear + 1;
  return new Date(Date.UTC(y, m - 1, 1));
};

const spread = (t: number | number[]): number[] =>
  Array.isArray(t) ? t : Array.from({ length: 12 }, () => t);


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

let businessUnitIds: Record<string, string> = {};

async function main() {
  businessUnitIds = await businessUnitsByCode();

  // The evaluation scale, if nobody has set one.
  //
  // Without bands every symbol is undefined and the sheet refuses to render at
  // all - lib/calc/bands.ts treats an empty scale as misconfiguration rather
  // than as "no opinion", which is right, but it means this seed cannot assume
  // the small worked example ran first. It usually has not: a fresh deployment
  // runs this one and nothing else.
  //
  // Created only when the table is empty, so an admin who has retuned the
  // scale keeps their version through a re-seed.
  if ((await prisma.evaluationBand.count()) === 0) {
    for (const band of DEFAULT_BANDS) await prisma.evaluationBand.create({ data: band });
  }
  console.log("Loading the UAT dataset…");

  // ------------------------------------------------------------- org units
  const company = await prisma.orgUnit.upsert({
    where: { code: "HONDA" },
    update: { name: "Honda" },
    create: { code: "HONDA", name: "Honda", type: "COMPANY", sortOrder: 0 },
  });

  const orgByCode = new Map<string, string>([["DA", company.id]]);
  for (const d of DIVISIONS) {
    const row = await prisma.orgUnit.upsert({
      where: { code: d.code },
      update: { name: d.name, parentId: company.id },
      create: { code: d.code, name: d.name, type: "DIVISION", parentId: company.id, sortOrder: d.sortOrder },
    });
    orgByCode.set(d.code, row.id);
  }
  for (const d of DEPARTMENTS) {
    const row = await prisma.orgUnit.upsert({
      where: { code: d.code },
      update: { name: d.name, parentId: orgByCode.get(d.parent)! },
      create: { code: d.code, name: d.name, type: "DEPARTMENT", parentId: orgByCode.get(d.parent)! },
    });
    orgByCode.set(d.code, row.id);
  }

  // ----------------------------------------------------------------- people
  // Every demo account shares one password. Fine on a laptop; not fine on a
  // public URL, where the sign-in page, the account list in this repo and a
  // guessable password are the whole of the lock. SEED_PASSWORD overrides it
  // for anything reachable from the internet.
  const password = process.env.SEED_PASSWORD || "hoshin";
  const passwordHash = await bcrypt.hash(password, 10);
  const userByOrg = new Map<string, string>();
  for (const p of PEOPLE) {
    const orgUnitId = p.org ? orgByCode.get(p.org)! : company.id;
    const row = await prisma.appUser.upsert({
      where: { email: p.email },
      update: { name: p.name, role: p.role, orgUnitId, passwordHash },
      create: { email: p.email, name: p.name, role: p.role, orgUnitId, passwordHash },
    });
    if (p.org) userByOrg.set(p.org, row.id);
  }

  // -------------------------------------------------------------------- Ki
  for (const spec of [KI.current, KI.next]) {
    const existing = await prisma.ki.findUnique({ where: { code: spec.code } });
    if (existing) {
      await prisma.node.deleteMany({ where: { kiId: existing.id } });
      await prisma.planVersion.deleteMany({ where: { kiId: existing.id } });
      await prisma.ki.delete({ where: { id: existing.id } });
    }
  }
  await prisma.ki.updateMany({ data: { isCurrent: false } });

  const mkKi = async (code: string, startYear: number, isCurrent: boolean) => {
    const ki = await prisma.ki.create({
      data: {
        code,
        startDate: new Date(Date.UTC(startYear, 3, 1)),
        endDate: new Date(Date.UTC(startYear + 1, 2, 31)),
        isCurrent,
      },
    });
    await prisma.planVersion.createMany({
      data: PLAN_VERSIONS.map((v) => ({ ...v, kiId: ki.id })),
    });
    return ki;
  };

  const ki = await mkKi(KI.current.code, KI.current.startYear, true);
  await mkKi(KI.next.code, KI.next.startYear, false);

  const versions = await prisma.planVersion.findMany({ where: { kiId: ki.id } });
  const ob = versions.find((v) => v.code === "OB")!;
  const prb = versions.find((v) => v.code === "PRB")!;
  const act = versions.find((v) => v.isActual)!;

  // -------------------------------------------------------------- structure
  let itemCount = 0;
  const entries: Array<{
    controlItemId: string; period: Date; planVersionId: string; rawValue: number;
  }> = [];

  async function addItems(nodeId: string, items: Item[], level: number) {
    for (const [i, item] of items.entries()) {
      const created = await prisma.controlItem.create({
        data: {
          nodeId,
          code: item.code,
          name: item.name,
          measuredAs: item.measuredAs,
          unit: item.unit,
          direction: item.dir,
          businessUnitId: businessUnitIds[item.bu ?? "AUTO"],
          achievementMethod: item.method,
          aggregation: item.agg,
          decimalPlaces: item.dp,
          dicOrgUnitId: orgByCode.get(item.dic)!,
          responsibleUserId: userByOrg.get(item.dic) ?? null,
          sortOrder: i,
        },
      });
      itemCount += 1;

      const targets = spread(item.target);
      for (let m = 0; m < 12; m++) {
        const period = month(KI.current.startYear, m);
        entries.push({ controlItemId: created.id, period, planVersionId: prb.id, rawValue: targets[m] });
        // The Original Budget sits a little under the press-release number, so
        // switching Target between versions visibly moves achievement.
        entries.push({
          controlItemId: created.id, period, planVersionId: ob.id,
          rawValue: Number((targets[m] * (item.dir === "LOWER_BETTER" ? 1.04 : 0.96)).toFixed(item.dp)),
        });
      }
      for (let m = 0; m < Math.min(MONTHS_KEYED, item.actual.length); m++) {
        entries.push({
          controlItemId: created.id,
          period: month(KI.current.startYear, m),
          planVersionId: act.id,
          rawValue: item.actual[m],
        });
      }
    }
    void level;
  }

  async function addObjective(parentId: string, level: number, objective: Objective, sortOrder: number) {
    const obj = await prisma.node.create({
      data: {
        kiId: ki.id, parentId, level, kind: "OBJECTIVE",
        statement: objective.statement, orgUnitId: company.id, sortOrder,
      },
    });
    await addItems(obj.id, objective.items, level);

    if (objective.sub) {
      const theme3 = await prisma.node.create({
        data: {
          kiId: ki.id, parentId: obj.id, level: 3, kind: "THEME",
          statement: objective.sub.theme, orgUnitId: company.id, sortOrder: 0,
        },
      });
      for (const [i, o] of objective.sub.objectives.entries()) {
        await addObjective(theme3.id, 3, o, i);
      }
    }

    for (const [i, branch] of (objective.branches ?? []).entries()) {
      const orgUnitId = orgByCode.get(branch.orgUnit)!;
      const theme4 = await prisma.node.create({
        data: {
          kiId: ki.id, parentId: obj.id, level: 4, kind: "THEME",
          statement: branch.theme, orgUnitId, sortOrder: i,
        },
      });
      for (const [j, o] of branch.objectives.entries()) {
        const obj4 = await prisma.node.create({
          data: {
            kiId: ki.id, parentId: theme4.id, level: 4, kind: "OBJECTIVE",
            statement: o.statement, orgUnitId, sortOrder: j,
          },
        });
        await addItems(obj4.id, o.items, 4);
      }
    }
  }

  for (const [g, goal] of GOALS.entries()) {
    const goalNode = await prisma.node.create({
      data: {
        kiId: ki.id, parentId: null, level: 1, kind: "GOAL",
        statement: goal.statement, orgUnitId: company.id, sortOrder: g,
      },
    });
    for (const [t, theme] of goal.themes.entries()) {
      const themeNode = await prisma.node.create({
        data: {
          kiId: ki.id, parentId: goalNode.id, level: 2, kind: "THEME",
          statement: theme.statement, orgUnitId: company.id, sortOrder: t,
        },
      });
      for (const [o, objective] of theme.objectives.entries()) {
        await addObjective(themeNode.id, 2, objective, o);
      }
    }
  }

  // Written in one go: a few thousand rows one at a time is slow enough to
  // look broken when someone is watching the demo being set up.
  for (let i = 0; i < entries.length; i += 1000) {
    await prisma.entry.createMany({ data: entries.slice(i, i + 1000) });
  }

  const nodes = await prisma.node.count({ where: { kiId: ki.id } });
  console.log(`  org units:      ${orgByCode.size}`);
  console.log(
    `  people:         ${PEOPLE.length} (password for all: ` +
      (process.env.SEED_PASSWORD ? "set from SEED_PASSWORD" : '"hoshin"') +
      ")",
  );
  console.log(`  ${KI.current.code}:         ${nodes} rows, ${itemCount} Control Items, ${entries.length} figures`);
  console.log(`  ${KI.next.code}:         created empty, ready to plan`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
