/**
 * The data migration that puts back the rung an older plan is missing.
 *
 * Plans built before "a Level 4 ladders from a Level 3" was enforced have
 * department branches hanging straight off a Level 2. The migration inserts
 * the Level 3 and re-parents them onto it, and the whole of its value is that
 * it does so without losing anything - so that is what this asserts: same
 * branches, same Control Items, same figures, one new row above them.
 *
 * It runs the real `migration.sql` rather than a copy, because a test against
 * a paraphrase of the migration would pass while the migration itself was
 * broken. The statement only ever touches Level 4 rows whose parent is a Level
 * 2, and by the end of this file there are none left, so running it here does
 * not disturb the rest of the suite.
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, prisma, type Fixture } from "./fixture";

const MIGRATION = readFileSync(
  new URL(
    "../prisma/migrations/20260901090000_relink_level_4_under_level_3/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

let fx: Fixture;
/** The Level 2 the legacy branches hang off, as an older seeder left them. */
let legacyParentId: string;
let branchIds: string[];

beforeAll(async () => {
  fx = await createFixture();

  const parent = await prisma.node.create({
    data: {
      kiId: fx.kiId,
      parentId: fx.nodes.goal,
      level: 2,
      kind: "OBJECTIVE",
      statement: "Parts and service gross profit",
      sortOrder: 5,
    },
  });
  legacyParentId = parent.id;

  // Sparse sort orders, the way a seeder that numbered in blocks left them.
  branchIds = [];
  for (const sortOrder of [40, 10, 20]) {
    const branch = await prisma.node.create({
      data: {
        kiId: fx.kiId,
        parentId: parent.id,
        level: 4,
        kind: "OBJECTIVE",
        statement: `Legacy branch ${sortOrder}`,
        orgUnitId: fx.orgUnits.alpha,
        sortOrder,
      },
    });
    branchIds.push(branch.id);
    await prisma.controlItem.create({
      data: {
        nodeId: branch.id,
        code: `LEGACY-${sortOrder}-${fx.kiCode.slice(-6)}`,
        unit: "COUNT",
        direction: "HIGHER_BETTER",
        achievementMethod: "RATIO",
        aggregation: "SUM",
        decimalPlaces: 0,
        dicOrgUnitId: fx.orgUnits.alpha,
        businessUnitId: fx.businessUnits.AUTO,
      },
    });
  }

  await prisma.$executeRawUnsafe(MIGRATION);
});

afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

const childrenOf = (parentId: string) =>
  prisma.node.findMany({
    where: { parentId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, level: true, statement: true, sortOrder: true, orgUnitId: true },
  });

describe("relinking Level 4 branches under a Level 3", () => {
  it("leaves the Level 2 carrying exactly one child, and it is a Level 3", async () => {
    const children = await childrenOf(legacyParentId);
    expect(children).toHaveLength(1);
    expect(children[0].level).toBe(3);
  });

  it("carries the Level 2's own statement down, rather than inventing one", async () => {
    // The company never wrote this deployment down, so there is no wording to
    // recover. Repeating it says what actually happened and renames easily.
    const [deployment] = await childrenOf(legacyParentId);
    expect(deployment.statement).toBe("Parts and service gross profit");
  });

  it("leaves the new Level 3 owned by nobody, the way a company row is", async () => {
    const [deployment] = await childrenOf(legacyParentId);
    expect(deployment.orgUnitId).toBeNull();
  });

  it("keeps the branch where it was in the reading order", async () => {
    // The lowest sort order among the children it adopts, so the block does
    // not jump somewhere else on the sheet.
    const [deployment] = await childrenOf(legacyParentId);
    expect(deployment.sortOrder).toBe(10);
  });

  it("moves every branch onto it, and none of them anywhere else", async () => {
    const [deployment] = await childrenOf(legacyParentId);
    const moved = await childrenOf(deployment.id);
    expect(moved.map((row) => row.id).sort()).toEqual([...branchIds].sort());
    expect(moved.every((row) => row.level === 4)).toBe(true);
  });

  it("keeps each branch's own order among its siblings", async () => {
    const [deployment] = await childrenOf(legacyParentId);
    const moved = await childrenOf(deployment.id);
    expect(moved.map((row) => row.sortOrder)).toEqual([10, 20, 40]);
  });

  it("loses no branch, no Control Item and no owner", async () => {
    const branches = await prisma.node.findMany({
      where: { id: { in: branchIds } },
      select: { statement: true, orgUnitId: true, _count: { select: { controlItems: true } } },
    });
    expect(branches).toHaveLength(3);
    expect(branches.every((row) => row._count.controlItems === 1)).toBe(true);
    expect(branches.every((row) => row.orgUnitId === fx.orgUnits.alpha)).toBe(true);
  });

  it("leaves the Ki's tree legal", async () => {
    const nodes = await prisma.node.findMany({
      where: { kiId: fx.kiId },
      select: { id: true, level: true, parentId: true },
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      if (!node.parentId) {
        expect(node.level).toBe(1);
        continue;
      }
      const parent = byId.get(node.parentId);
      expect(parent).toBeDefined();
      expect(node.level).toBe(parent!.level + 1);
    }
  });

  it("changes nothing on a second run", async () => {
    const before = await prisma.node.count({ where: { kiId: fx.kiId } });
    await prisma.$executeRawUnsafe(MIGRATION);
    expect(await prisma.node.count({ where: { kiId: fx.kiId } })).toBe(before);
    expect(await childrenOf(legacyParentId)).toHaveLength(1);
  });
});
