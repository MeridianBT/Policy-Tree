/**
 * Integration tests for the structure-edit server actions, against a real
 * database. These are the highest-risk new code in the platform: every one of
 * them decides whether a division or department lead may touch a piece of the
 * plan, and getting that wrong either locks someone out of their own
 * department or lets them edit someone else's.
 *
 * The actions call `requireSession`/`requireRole` internally rather than
 * taking a user as a parameter (unlike `saveEntry`), because they are
 * "use server" actions meant to be invoked from a request. That boundary is
 * mocked here to return a fixture user under test; every downstream call -
 * the Prisma writes, the org-unit-coverage check, the two-step delete
 * confirmation - runs for real, against real Postgres.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { codeOf, createFixture, prisma, setRaw, type Fixture } from "./fixture";
import type { AuthenticatedUser } from "@/lib/auth/types";

let currentUser: AuthenticatedUser;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// lib/auth/session.ts pulls in next-auth's Node config, which needs a live
// request context Vitest does not have. The mock is built from the pieces
// that do not - lib/auth/permissions.ts and lib/auth/errors.ts are plain
// Prisma-backed functions - so canEditStructureAt and assignableOrgUnitIds
// stay real while only the session boundary itself is stood in for.
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

const {
  addControlItem,
  addControlItemToObjective,
  addDepartmentBranch,
  addNode,
  assignableDics,
  deleteControlItem,
  deleteNode,
  renameNode,
  reorderRow,
  updateControlItem,
  assignableUsers,
} = await import("@/lib/structure/actions");
const { createDepartment, deleteDepartment } = await import("@/lib/admin/actions");

function asUser(user: AuthenticatedUser) {
  currentUser = user;
}

let codeCounter = 0;
/** A department code under the 20-character limit, unique per test run. */
function shortCode(prefix: string): string {
  return `${prefix}-${(codeCounter++).toString(36)}${Date.now().toString(36).slice(-4)}`.toUpperCase();
}

let fx: Fixture;
// Departments created mid-test via createDepartment aren't tracked by the
// shared fixture's own cleanup, and deleting a Division only SETs their
// parent_id NULL rather than removing them - so they're tracked here and
// swept before the fixture (and its divisions) go away.
const createdDepartmentIds: string[] = [];

beforeAll(async () => {
  fx = await createFixture();
});

afterAll(async () => {
  if (createdDepartmentIds.length) {
    await prisma.orgUnit.deleteMany({ where: { id: { in: createdDepartmentIds } } });
  }
  await fx.cleanup();
  await prisma.$disconnect();
});

beforeEach(() => {
  asUser(fx.users.admin);
});

describe("company-wide structure (Levels 1-3)", () => {
  it("lets an ADMIN add a Theme under the Goal", async () => {
    const result = await addNode({ kiId: fx.kiId, parentId: fx.nodes.goal, statement: "Another theme" });
    expect(result.ok).toBe(true);
  });

  it("refuses an OWNER touching Levels 1-3, even one who owns a Level 4 branch elsewhere", async () => {
    asUser(fx.users.alphaLead);
    const result = await addNode({ kiId: fx.kiId, parentId: fx.nodes.goal, statement: "Sneaky theme" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/admin/i);
  });

  it("refuses a VIEWER outright", async () => {
    asUser(fx.users.viewer);
    const result = await addNode({ kiId: fx.kiId, parentId: fx.nodes.goal, statement: "Viewer theme" });
    expect(result.ok).toBe(false);
  });

  it("never lets a continuation from a Level 3 Objective create an orphaned Level 4 node", async () => {
    // Continue to a Level 3 Objective, then confirm addNode refuses to go
    // past it - that step must go through addDepartmentBranch, which always
    // carries an org unit.
    const l3Objective = await addNode({
      kiId: fx.kiId,
      parentId: fx.nodes.objective,
      statement: "L3 objective",
    });
    expect(l3Objective.ok && l3Objective.id).toBeTruthy();
    const l3ObjectiveId = (l3Objective as { id: string }).id;

    const node = await prisma.node.findUniqueOrThrow({ where: { id: l3ObjectiveId } });
    expect(node.level).toBe(3);

    const noFurtherChild = await addNode({ kiId: fx.kiId, parentId: l3ObjectiveId, statement: "orphan" });
    expect(noFurtherChild).toEqual({ ok: false, message: "Nothing can be added under that row." });
  });
});

describe("addDepartmentBranch - the department-lead path", () => {
  it("lets a division lead ladder a Level 4 branch off the company objective", async () => {
    asUser(fx.users.alphaLead);
    const result = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "Alpha's own deployment",
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.id) {
      const node = await prisma.node.findUniqueOrThrow({ where: { id: result.id } });
      expect(node.level).toBe(4);
      expect(node.kind).toBe("OBJECTIVE");
      expect(node.orgUnitId).toBe(fx.orgUnits.alpha);
    }
  });

  it("lets a division lead file the branch under one of their own departments instead", async () => {
    asUser(fx.users.alphaLead);
    const result = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alphaDept,
      statement: "Alpha Dept's own deployment",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a division lead filing a branch under a different division", async () => {
    asUser(fx.users.alphaLead);
    const result = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.beta,
      statement: "Should not be allowed",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/your own/i);
  });

  it("lets an ADMIN file a branch under any division", async () => {
    const result = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.beta,
      statement: "Admin filing for Beta",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a branch off a Level 4 Objective - there is nothing deeper to ladder from", async () => {
    asUser(fx.users.alphaLead);
    const branch = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "For depth test",
    });
    const branchId = (branch as { id: string }).id;

    // The branch *is* the Objective now, so laddering off it would be asking
    // for a Level 5.
    const tooDeep = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: branchId,
      orgUnitId: fx.orgUnits.alpha,
      statement: "Too deep",
    });
    expect(tooDeep).toEqual({
      ok: false,
      message: "A department branch ladders from a Level 2 or 3 Objective.",
    });
  });
});

describe("editing an existing Level 4 branch", () => {
  let branchId: string;

  beforeAll(async () => {
    asUser(fx.users.alphaLead);
    const branch = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "Editable branch",
    });
    branchId = (branch as { id: string }).id;
  });

  it("lets the owning division lead start a second branch of their own", async () => {
    // A department that needs a second Objective ladders another branch off
    // the same company Objective; there is no tier between the two any more.
    asUser(fx.users.alphaLead);
    const result = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "A second objective",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a different division's lead adding to it", async () => {
    asUser(fx.users.betaLead);
    const result = await addControlItemToObjective({
      objectiveId: branchId,
      measuredAs: "Should not land here",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.beta,
      businessUnitId: fx.businessUnits.AUTO,
    });
    expect(result.ok).toBe(false);
  });

  it("lets the owning lead add a Control Item, scoped to their own DIC", async () => {
    asUser(fx.users.alphaLead);
    const result = await addControlItemToObjective({
      objectiveId: branchId,
      measuredAs: "Widgets",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses that same lead assigning the Control Item to another division's DIC", async () => {
    asUser(fx.users.alphaLead);
    const result = await addControlItemToObjective({
      objectiveId: branchId,
      measuredAs: "Widgets",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.beta,
      businessUnitId: fx.businessUnits.AUTO,
    });
    expect(result.ok).toBe(false);
  });

  it("chooses INVERSE achievement automatically for a lower-is-better measure", async () => {
    asUser(fx.users.alphaLead);
    const result = await addControlItemToObjective({
      objectiveId: branchId,
      measuredAs: "US$",
      unit: "CURRENCY",
      direction: "LOWER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.id) {
      const item = await prisma.controlItem.findUniqueOrThrow({ where: { id: result.id } });
      expect(item.achievementMethod).toBe("INVERSE");
    }
  });

  it("lets the owning lead rename their own branch, refuses a stranger", async () => {
    asUser(fx.users.betaLead);
    expect((await renameNode({ id: branchId, statement: "Hijacked" })).ok).toBe(false);

    asUser(fx.users.alphaLead);
    expect((await renameNode({ id: branchId, statement: "Renamed by owner" })).ok).toBe(true);
  });
});

describe("assignableDics", () => {
  it("gives ADMIN every division and department", async () => {
    asUser(fx.users.admin);
    const dics = await assignableDics();
    const codes = dics.map((d) => d.id);
    expect(codes).toContain(fx.orgUnits.alpha);
    expect(codes).toContain(fx.orgUnits.beta);
  });

  it("gives a division lead only their own division and its departments", async () => {
    asUser(fx.users.alphaLead);
    const dics = await assignableDics();
    const ids = dics.map((d) => d.id);
    expect(ids).toContain(fx.orgUnits.alpha);
    expect(ids).toContain(fx.orgUnits.alphaDept);
    expect(ids).not.toContain(fx.orgUnits.beta);
  });

  it("gives a VIEWER nothing to assign", async () => {
    asUser(fx.users.viewer);
    expect(await assignableDics()).toEqual([]);
  });
});

describe("deleting a Level 4 branch - two-step confirmation, scoped", () => {
  it("refuses a stranger even the confirmation step", async () => {
    asUser(fx.users.alphaLead);
    const branch = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "To be deleted",
    });
    const id = (branch as { id: string }).id;

    asUser(fx.users.betaLead);
    const attempt = await deleteNode({ id, confirm: false });
    expect(attempt.ok).toBe(false);

    // A refusal on scope grounds never carries "needsConfirmation" - that
    // would leak how much data sits behind a branch this user cannot touch.
    expect("needsConfirmation" in attempt).toBe(false);
  });

  it("reports the impact to the owner, then deletes only on confirmation", async () => {
    asUser(fx.users.alphaLead);
    const branch = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "Branch with a child",
    });
    const branchId = (branch as { id: string }).id;
    await addControlItemToObjective({
      objectiveId: branchId,
      measuredAs: "Child figure",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });

    const firstCall = await deleteNode({ id: branchId, confirm: false });
    expect(firstCall.ok).toBe(false);
    expect("needsConfirmation" in firstCall && firstCall.needsConfirmation).toBe(true);

    const stillThere = await prisma.node.findUnique({ where: { id: branchId } });
    expect(stillThere).not.toBeNull();

    const confirmed = await deleteNode({ id: branchId, confirm: true });
    expect(confirmed.ok).toBe(true);

    const gone = await prisma.node.findUnique({ where: { id: branchId } });
    expect(gone).toBeNull();
  });
});

describe("Control Item deletion, scoped the same way", () => {
  it("refuses a stranger, lets the owner delete their own", async () => {
    asUser(fx.users.alphaLead);
    const branch = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "For item deletion",
    });
    const item = await addControlItemToObjective({
      objectiveId: (branch as { id: string }).id,
      measuredAs: "Units",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    const itemId = (item as { id: string }).id;

    asUser(fx.users.betaLead);
    expect((await deleteControlItem({ id: itemId, confirm: false })).ok).toBe(false);

    asUser(fx.users.alphaLead);
    expect((await deleteControlItem({ id: itemId, confirm: false })).ok).toBe(true);
  });
});

describe("department (org unit) management - ADMIN only, never cascades", () => {
  it("creates a department under a division", async () => {
    const result = await createDepartment({
      divisionId: fx.orgUnits.alpha,
      code: shortCode("D2"),
      name: "Second Alpha Department",
    });
    expect(result.ok).toBe(true);
    const department = await prisma.orgUnit.findFirstOrThrow({
      where: { name: "Second Alpha Department" },
    });
    createdDepartmentIds.push(department.id);
  });

  it("refuses a division lead - this is org-chart housekeeping, ADMIN only", async () => {
    asUser(fx.users.alphaLead);
    const result = await createDepartment({
      divisionId: fx.orgUnits.alpha,
      code: shortCode("SNEAKY"),
      name: "Should not be created",
    });
    expect(result.ok).toBe(false);
  });

  it("deletes an empty department cleanly", async () => {
    const code = shortCode("TEMP");
    const created = await createDepartment({ divisionId: fx.orgUnits.alpha, code, name: "Temp" });
    expect(created.ok).toBe(true);

    const department = await prisma.orgUnit.findUniqueOrThrow({ where: { code } });
    const deleted = await deleteDepartment(department.id);
    expect(deleted.ok).toBe(true);
    expect(await prisma.orgUnit.findUnique({ where: { id: department.id } })).toBeNull();
  });

  it("refuses to delete a department that a Level 4 node still points at", async () => {
    // alphaDept carries the "D" Control Item from the fixture (dicOrgUnitId).
    const result = await deleteDepartment(fx.orgUnits.alphaDept);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/pointing at it/);

    // And it must still exist - refused, not silently orphaned via SET NULL.
    const stillThere = await prisma.orgUnit.findUnique({ where: { id: fx.orgUnits.alphaDept } });
    expect(stillThere).not.toBeNull();
  });
});

describe("a locked version is not the delete's to take", () => {
  /**
   * The defect this covers: deleting a node removes its Control Items and
   * their entries by database cascade, so no application code was ever asked
   * whether a plan version was locked. A closed forecast could therefore be
   * erased by deleting the row above it - exactly the history rewrite that
   * lib/entries/save.ts refuses outright on the cell path.
   *
   * These run against a real database on purpose: the cascade is a schema
   * behaviour, so a mocked Prisma would prove nothing about it.
   */
  let goalId: string;
  let itemId: string;
  let versionId: string;

  beforeEach(async () => {
    asUser(fx.users.admin);
    const goal = await addNode({ kiId: fx.kiId, parentId: null, statement: "Locked goal" });
    goalId = goal.ok ? goal.id! : "";
    const objective = await addNode({
      kiId: fx.kiId,
      parentId: goalId,
      statement: "Locked objective",
    });
    const item = await addControlItem({
      nodeId: objective.ok ? objective.id! : "",
      name: `Locked measure ${Date.now()}`,
      measuredAs: "Units",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    itemId = item.ok ? item.id! : "";

    versionId = fx.versions.PRB;
    await prisma.entry.create({
      data: {
        controlItemId: itemId,
        period: new Date(Date.UTC(2026, 3, 1)),
        planVersionId: versionId,
        rawValue: "100",
      },
    });
    await prisma.planVersion.update({
      where: { id: versionId },
      data: { lockedAt: new Date() },
    });
  });

  afterEach(async () => {
    await prisma.planVersion.update({ where: { id: versionId }, data: { lockedAt: null } });
    await prisma.node.deleteMany({ where: { id: goalId } });
  });

  it("refuses to delete a Goal whose descendants hold a locked figure", async () => {
    const attempt = await deleteNode({ id: goalId, confirm: true });
    expect(attempt.ok).toBe(false);
    expect(attempt.message).toContain("PRB");
    expect(await prisma.node.count({ where: { id: goalId } })).toBe(1);
  });

  it("refuses even with confirmation, and even for a SUPER_ADMIN", async () => {
    // There is no override. The cell path has none either; this is the same
    // rule reaching the same conclusion by a different route.
    asUser(fx.users.admin);
    expect((await deleteNode({ id: goalId, confirm: true })).ok).toBe(false);
    expect(await prisma.entry.count({ where: { controlItemId: itemId } })).toBe(1);
  });

  it("refuses to delete the Control Item itself", async () => {
    const attempt = await deleteControlItem({ id: itemId, confirm: true });
    expect(attempt.ok).toBe(false);
    expect(attempt.message).toContain("PRB");
    expect(await prisma.controlItem.count({ where: { id: itemId } })).toBe(1);
  });

  it("allows the delete once the version is unlocked", async () => {
    await prisma.planVersion.update({ where: { id: versionId }, data: { lockedAt: null } });
    const attempt = await deleteNode({ id: goalId, confirm: true });
    expect(attempt.ok).toBe(true);
    expect(await prisma.node.count({ where: { id: goalId } })).toBe(0);
  });

  it("lets an EXECUTIVE delete a row carrying only unlocked figures", async () => {
    // The rule is about the lock, not about emptiness: an executive may remove
    // a Level 1-3 row that already has numbers against it, provided every one
    // of them is still open.
    await prisma.planVersion.update({ where: { id: versionId }, data: { lockedAt: null } });
    asUser(fx.users.executive);
    const attempt = await deleteNode({ id: goalId, confirm: true });
    expect(attempt.ok).toBe(true);
  });

  it("refuses an EXECUTIVE the same delete when a figure is locked", async () => {
    asUser(fx.users.executive);
    const attempt = await deleteNode({ id: goalId, confirm: true });
    expect(attempt.ok).toBe(false);
    expect(attempt.message).toContain("PRB");
  });
});

describe("an EXECUTIVE reaches Level 4 as well", () => {
  /**
   * The company-wide roles are not scoped by org unit at any level. What is
   * worth proving here is the case the OWNER rule refuses: a Level 4 branch
   * belonging to a division the actor has no relationship with. An OWNER of
   * Beta cannot touch Alpha's branch; an EXECUTIVE can, and it is the same
   * branch and the same call.
   */
  let branchId: string;

  beforeAll(async () => {
    asUser(fx.users.alphaLead);
    const branch = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "Alpha's own branch",
    });
    branchId = (branch as { id: string }).id;
  });

  it("adds a Control Item to another division's branch", async () => {
    asUser(fx.users.executive);
    const result = await addControlItemToObjective({
      objectiveId: branchId,
      measuredAs: "Added by an executive",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    expect(result.ok).toBe(true);
  });

  it("renames another division's Level 4 branch", async () => {
    asUser(fx.users.executive);
    expect((await renameNode({ id: branchId, statement: "Renamed by an executive" })).ok).toBe(true);
  });

  it("files a new branch under a division it has no relationship with", async () => {
    asUser(fx.users.executive);
    const result = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.beta,
      statement: "Executive's branch under Beta",
    });
    expect(result.ok).toBe(true);
  });

  it("still refuses a division lead the same reach", async () => {
    // The rule widened for EXECUTIVE only. An OWNER's scope is unchanged.
    asUser(fx.users.betaLead);
    const result = await addControlItemToObjective({
      objectiveId: branchId,
      measuredAs: "Beta reaching into Alpha",
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.beta,
      businessUnitId: fx.businessUnits.AUTO,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a VIEWER entirely", async () => {
    asUser(fx.users.viewer);
    expect((await renameNode({ id: branchId, statement: "Viewer rename" })).ok).toBe(false);
  });
});

describe("reordering rows", () => {
  /** Control Item ids under the fixture Objective, in the order the sheet shows them. */
  async function measureOrder(): Promise<string[]> {
    const rows = await prisma.controlItem.findMany({
      where: { nodeId: fx.nodes.objective },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  const ABCD = () => [fx.items.A, fx.items.B, fx.items.C, fx.items.D];

  it("moves a measure in front of the one it was dropped on", async () => {
    expect(await measureOrder()).toEqual(ABCD());

    const result = await reorderRow({ kind: "MEASURE", id: fx.items.D, beforeId: fx.items.A });
    expect(result.ok).toBe(true);
    expect(await measureOrder()).toEqual([fx.items.D, fx.items.A, fx.items.B, fx.items.C]);

    // Put it back, this time by dropping it past the end.
    expect((await reorderRow({ kind: "MEASURE", id: fx.items.D, beforeId: null })).ok).toBe(true);
    expect(await measureOrder()).toEqual(ABCD());
  });

  it("refuses a target that is not a sibling", async () => {
    // The id of a row under a different parent. Nothing about the request looks
    // malformed - it is only the sibling check that catches it.
    const stranger = await prisma.controlItem.findFirstOrThrow({
      where: { nodeId: { not: fx.nodes.objective } },
      select: { id: true },
    });
    const result = await reorderRow({ kind: "MEASURE", id: fx.items.A, beforeId: stranger.id });
    expect(result.ok).toBe(false);
    expect(await measureOrder()).toEqual(ABCD());
  });

  it("refuses an OWNER reordering the company-wide Levels 1-3", async () => {
    // Item A sits under a Level 2 Objective, so this is company structure even
    // though the measure itself is filed against the lead's own division.
    asUser(fx.users.alphaLead);
    expect((await reorderRow({ kind: "MEASURE", id: fx.items.A, beforeId: fx.items.C })).ok).toBe(
      false,
    );
    expect(await measureOrder()).toEqual(ABCD());
  });

  it("refuses a VIEWER outright", async () => {
    asUser(fx.users.viewer);
    expect((await reorderRow({ kind: "MEASURE", id: fx.items.A, beforeId: fx.items.C })).ok).toBe(
      false,
    );
  });

  it("reorders nodes among their siblings without touching their parent", async () => {
    const first = await addNode({ kiId: fx.kiId, parentId: fx.nodes.goal, statement: "Reorder me" });
    const second = await addNode({ kiId: fx.kiId, parentId: fx.nodes.goal, statement: "And me" });
    const firstId = (first as { id: string }).id;
    const secondId = (second as { id: string }).id;

    expect((await reorderRow({ kind: "NODE", id: secondId, beforeId: firstId })).ok).toBe(true);

    const siblings = await prisma.node.findMany({
      where: { parentId: fx.nodes.goal },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, parentId: true },
    });
    expect(siblings.map((node) => node.id).indexOf(secondId)).toBeLessThan(
      siblings.map((node) => node.id).indexOf(firstId),
    );
    // The whole point of writing only sort_order: nothing was re-filed.
    expect(siblings.every((node) => node.parentId === fx.nodes.goal)).toBe(true);
  });

  it("leaves a Level 4 department branch alone when a Level 3 sibling moves", async () => {
    // The mixed-level case: an Objective carrying both company-level structure
    // and a department's branch. Reordering "within their level" must not
    // renumber the branch out from under its owner.
    const l3ThemeA = await addNode({ kiId: fx.kiId, parentId: fx.nodes.objective, statement: "L3 A" });
    const branch = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "Alpha branch between the themes",
    });
    const l3ThemeB = await addNode({ kiId: fx.kiId, parentId: fx.nodes.objective, statement: "L3 B" });

    const branchId = (branch as { id: string }).id;
    const branchBefore = await prisma.node.findUniqueOrThrow({
      where: { id: branchId },
      select: { sortOrder: true },
    });

    expect(
      (
        await reorderRow({
          kind: "NODE",
          id: (l3ThemeB as { id: string }).id,
          beforeId: (l3ThemeA as { id: string }).id,
        })
      ).ok,
    ).toBe(true);

    const branchAfter = await prisma.node.findUniqueOrThrow({
      where: { id: branchId },
      select: { sortOrder: true },
    });
    expect(branchAfter.sortOrder).toBe(branchBefore.sortOrder);
  });
});

/**
 * Editing a measure in place.
 *
 * Two rules here are not obvious from the outside and both are the point of
 * the feature. Moving a measure to another department needs authority over
 * where it is *going* as well as where it has been - otherwise a division lead
 * could push work onto a division that never agreed to it. And roll-up and
 * direction reach back through stored figures, so changing them on a measure
 * that a locked version holds would rewrite what was committed.
 */
describe("editing a Control Item", () => {
  /** The measure as it stands, for building an edit that changes one thing. */
  async function current(id: string) {
    const item = await prisma.controlItem.findUniqueOrThrow({
      where: { id },
      select: {
        measuredAs: true, unit: true, direction: true,
        aggregation: true, decimalPlaces: true, dicOrgUnitId: true, businessUnitId: true,
        node: { select: { statement: true } },
      },
    });
    const { node, ...rest } = item;
    return { id, name: node.statement, ...rest };
  }

  /*
   * A Level 4 measure of Alpha's own, because that is where an OWNER's
   * authority actually lives. The fixture's own measures hang off a Level 2
   * Objective, which is company-wide and closed to them whichever division
   * they lead - the same rule that governs every other structure edit.
   */
  let alphaBranchId: string;
  let alphaMeasureId: string;

  beforeAll(async () => {
    asUser(fx.users.admin);
    const branch = await addDepartmentBranch({
      kiId: fx.kiId,
      parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha,
      statement: "Alpha branch for edit tests",
    });
    alphaBranchId = (branch as { id: string }).id;
    const measure = await addControlItemToObjective({
      objectiveId: alphaBranchId,
      measuredAs: null,
      unit: "COUNT",
      direction: "HIGHER_BETTER",
      aggregation: "SUM",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    alphaMeasureId = (measure as { id: string }).id;
  });

  it("changes everything the add form could set", async () => {
    const before = await current(fx.items.B);
    const result = await updateControlItem({
      ...before,
      name: "Item B, renamed",
      measuredAs: "Units delivered",
      unit: "CURRENCY",
      decimalPlaces: 2,
      businessUnitId: fx.businessUnits.MC,
    });
    expect(result.ok).toBe(true);

    const after = await current(fx.items.B);
    expect(after.name).toBe("Item B, renamed");
    expect(after.measuredAs).toBe("Units delivered");
    expect(after.unit).toBe("CURRENCY");
    expect(after.decimalPlaces).toBe(2);
    expect(after.businessUnitId).toBe(fx.businessUnits.MC);
  });

  it("re-derives the achievement method from the direction", async () => {
    // INVERSE is a consequence of "lower is better", not a separate choice,
    // exactly as it is on creation.
    const before = await current(fx.items.B);
    await updateControlItem({ ...before, direction: "LOWER_BETTER" });
    expect(
      (await prisma.controlItem.findUniqueOrThrow({
        where: { id: fx.items.B }, select: { achievementMethod: true },
      })).achievementMethod,
    ).toBe("INVERSE");

    await updateControlItem({ ...(await current(fx.items.B)), direction: "HIGHER_BETTER" });
    expect(
      (await prisma.controlItem.findUniqueOrThrow({
        where: { id: fx.items.B }, select: { achievementMethod: true },
      })).achievementMethod,
    ).toBe("RATIO");
  });

  it("refuses a VIEWER", async () => {
    asUser(fx.users.viewer);
    expect((await updateControlItem(await current(fx.items.A))).ok).toBe(false);
  });

  it("refuses an OWNER the company-wide Levels 1-3, whoever they lead", async () => {
    asUser(fx.users.alphaLead);
    const result = await updateControlItem({ ...(await current(fx.items.A)), name: "Reaching up" });
    expect(result.ok).toBe(false);
    expect((await current(fx.items.A)).name).not.toBe("Reaching up");
  });

  it("lets an OWNER edit their own Level 4 measure", async () => {
    asUser(fx.users.alphaLead);
    const result = await updateControlItem({ ...(await current(alphaMeasureId)), decimalPlaces: 3 });
    expect(result.ok).toBe(true);
    expect((await current(alphaMeasureId)).decimalPlaces).toBe(3);
  });

  it("refuses another division's lead the same measure", async () => {
    asUser(fx.users.betaLead);
    const result = await updateControlItem({ ...(await current(alphaMeasureId)), name: "Beta reaching" });
    expect(result.ok).toBe(false);
    expect((await current(alphaMeasureId)).name).not.toBe("Beta reaching");
  });

  it("refuses an OWNER moving a measure into a division they do not hold", async () => {
    // The measure is theirs; the destination is not. Filing work onto another
    // division is the same act as creating it there, and addControlItem asks
    // permission for that too.
    asUser(fx.users.alphaLead);
    const result = await updateControlItem({
      ...(await current(alphaMeasureId)),
      dicOrgUnitId: fx.orgUnits.beta,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/responsible for/i);
    expect((await current(alphaMeasureId)).dicOrgUnitId).toBe(fx.orgUnits.alpha);
  });

  it("lets an OWNER move a measure into a department beneath their own division", async () => {
    asUser(fx.users.alphaLead);
    const result = await updateControlItem({
      ...(await current(alphaMeasureId)),
      dicOrgUnitId: fx.orgUnits.alphaDept,
    });
    expect(result.ok).toBe(true);
    await updateControlItem({ ...(await current(alphaMeasureId)), dicOrgUnitId: fx.orgUnits.alpha });
  });

  describe("against a locked version", () => {
    // Locked here rather than relying on the fixture: an earlier block in this
    // file unlocks PRB in its own cleanup, so the state has to be established
    // by whoever depends on it.
    beforeEach(async () => {
      await setRaw(fx.items.C, "2026-09", fx.versions.PRB, 42);
      await prisma.planVersion.update({
        where: { id: fx.versions.PRB }, data: { lockedAt: new Date() },
      });
      asUser(fx.users.admin);
    });
    afterEach(async () => {
      await prisma.planVersion.update({
        where: { id: fx.versions.PRB }, data: { lockedAt: null },
      });
    });

    it("refuses a roll-up change", async () => {
      const before = await current(fx.items.C);
      const result = await updateControlItem({ ...before, aggregation: "AVERAGE" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/PRB/);
      expect((await current(fx.items.C)).aggregation).toBe(before.aggregation);
    });

    it("refuses a direction change on the same grounds", async () => {
      const before = await current(fx.items.C);
      expect((await updateControlItem({ ...before, direction: "LOWER_BETTER" })).ok).toBe(false);
      expect((await current(fx.items.C)).direction).toBe(before.direction);
    });

    it("still allows everything that cannot change a stored figure", async () => {
      // The lock protects what a closed version says, not what the row is
      // called or which desk answers for it.
      const before = await current(fx.items.C);
      const result = await updateControlItem({
        ...before,
        name: "Renamed despite the lock",
        decimalPlaces: 1,
        measuredAs: "Still editable",
      });
      expect(result.ok).toBe(true);
      expect((await current(fx.items.C)).name).toBe("Renamed despite the lock");
    });
  });

  it("never changes the code a formula addresses the measure by", async () => {
    asUser(fx.users.admin);
    const codeBefore = await codeOf(fx.items.B);
    await updateControlItem({ ...(await current(fx.items.B)), name: "Something else entirely" });
    expect(await codeOf(fx.items.B)).toBe(codeBefore);
  });
});

/**
 * Naming somebody responsible for a measure.
 *
 * The rule that matters is the one a hidden dropdown cannot enforce: a
 * division lead may hand a measure to somebody in their own org unit and to
 * nobody else. The picker only decides what is offered; this is what decides
 * what is allowed.
 */
describe("who may be made responsible", () => {
  async function current(id: string) {
    const item = await prisma.controlItem.findUniqueOrThrow({
      where: { id },
      select: {
        measuredAs: true, unit: true, direction: true, aggregation: true,
        decimalPlaces: true, dicOrgUnitId: true, businessUnitId: true, responsibleUserId: true,
        node: { select: { statement: true } },
      },
    });
    const { node, ...rest } = item;
    return { id, name: node.statement, ...rest };
  }

  beforeEach(() => asUser(fx.users.admin));

  it("offers a SUPER_ADMIN every active account", async () => {
    const offered = await assignableUsers();
    const ids = offered.map((person) => person.id);
    for (const person of Object.values(fx.users)) expect(ids).toContain(person.id);
  });

  it("offers an OWNER only their own org unit and beneath", async () => {
    asUser(fx.users.alphaLead);
    const ids = (await assignableUsers()).map((person) => person.id);
    expect(ids).toContain(fx.users.alphaLead.id);
    // The Beta lead sits in a sibling division and must not be offered.
    expect(ids).not.toContain(fx.users.betaLead.id);
  });

  it("offers a VIEWER nobody at all", async () => {
    asUser(fx.users.viewer);
    expect(await assignableUsers()).toEqual([]);
  });

  it("never offers a deactivated account", async () => {
    await prisma.appUser.update({ where: { id: fx.users.betaLead.id }, data: { isActive: false } });
    try {
      const ids = (await assignableUsers()).map((person) => person.id);
      expect(ids).not.toContain(fx.users.betaLead.id);
    } finally {
      await prisma.appUser.update({ where: { id: fx.users.betaLead.id }, data: { isActive: true } });
    }
  });

  it("lets an admin name anyone, and clear it again", async () => {
    const before = await current(fx.items.A);
    expect((await updateControlItem({ ...before, responsibleUserId: fx.users.betaLead.id })).ok).toBe(true);
    expect((await current(fx.items.A)).responsibleUserId).toBe(fx.users.betaLead.id);

    expect((await updateControlItem({ ...(await current(fx.items.A)), responsibleUserId: null })).ok).toBe(true);
    expect((await current(fx.items.A)).responsibleUserId).toBeNull();
  });

  it("refuses an OWNER naming somebody outside their own org unit", async () => {
    // The measure is theirs to edit; the person is not theirs to assign. The
    // picker would not offer them, and the server does not rely on that.
    const branch = await addDepartmentBranch({
      kiId: fx.kiId, parentObjectiveId: fx.nodes.objective,
      orgUnitId: fx.orgUnits.alpha, statement: "Alpha branch for responsible tests",
    });
    const measure = await addControlItemToObjective({
      objectiveId: (branch as { id: string }).id, measuredAs: null,
      unit: "COUNT", direction: "HIGHER_BETTER", aggregation: "SUM", decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha, businessUnitId: fx.businessUnits.AUTO,
    });
    const measureId = (measure as { id: string }).id;

    asUser(fx.users.alphaLead);
    const refused = await updateControlItem({
      ...(await current(measureId)),
      responsibleUserId: fx.users.betaLead.id,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/own division or department/i);
    expect((await current(measureId)).responsibleUserId).toBeNull();

    // Their own division's lead is fine.
    const allowed = await updateControlItem({
      ...(await current(measureId)),
      responsibleUserId: fx.users.alphaLead.id,
    });
    expect(allowed.ok).toBe(true);
    expect((await current(measureId)).responsibleUserId).toBe(fx.users.alphaLead.id);
  });

  it("refuses a name that is not an account at all", async () => {
    const before = await current(fx.items.B);
    const result = await updateControlItem({ ...before, responsibleUserId: "not-a-user" });
    expect(result.ok).toBe(false);
    expect((await current(fx.items.B)).responsibleUserId).toBe(before.responsibleUserId);
  });

  it("carries the name through when a measure is created", async () => {
    const created = await addControlItem({
      nodeId: fx.nodes.objective, name: "Created with an owner", measuredAs: null,
      unit: "COUNT", direction: "HIGHER_BETTER", aggregation: "SUM", decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha, businessUnitId: fx.businessUnits.AUTO,
      responsibleUserId: fx.users.alphaLead.id,
    });
    expect(created.ok).toBe(true);
    expect((await current((created as { id: string }).id)).responsibleUserId).toBe(fx.users.alphaLead.id);
  });
});

describe("an Objective with several Control Items", () => {
  /*
   * The case the flattened tree exists for: one Objective held to several
   * targets at once. They share a statement and nothing else - each has its
   * own unit, direction, department, targets and evaluation - so what is worth
   * pinning is that the statement is shared and that everything else stays
   * separate.
   */
  let objectiveId: string;
  let firstItemId: string;

  async function itemsOfObjective() {
    return prisma.controlItem.findMany({
      where: { nodeId: objectiveId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, code: true, measuredAs: true, unit: true, dicOrgUnitId: true },
    });
  }

  const secondItem = (overrides: Record<string, unknown> = {}) => ({
    objectiveId,
    measuredAs: "% fixed first time",
    unit: "PERCENT" as const,
    direction: "HIGHER_BETTER" as const,
    aggregation: "AVERAGE" as const,
    decimalPlaces: 1,
    dicOrgUnitId: fx.orgUnits.alpha,
    businessUnitId: fx.businessUnits.AUTO,
    ...overrides,
  });

  beforeEach(async () => {
    asUser(fx.users.admin);
    // "Add a measure" is one act now: a child Objective and the first thing
    // that measures it, created together.
    const created = await addControlItem({
      nodeId: fx.nodes.objective,
      name: "Service experience",
      measuredAs: "NPS",
      unit: "INDEX",
      direction: "HIGHER_BETTER",
      aggregation: "AVERAGE",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    firstItemId = (created as { id: string }).id;
    objectiveId = (
      await prisma.controlItem.findUniqueOrThrow({
        where: { id: firstItemId },
        select: { nodeId: true },
      })
    ).nodeId;
  });

  afterEach(async () => {
    await prisma.node.deleteMany({ where: { id: objectiveId } });
  });

  it("adds a second Control Item under the same statement", async () => {
    const result = await addControlItemToObjective(
      secondItem({ dicOrgUnitId: fx.orgUnits.beta, businessUnitId: fx.businessUnits.MC }),
    );
    expect(result.ok).toBe(true);

    const items = await itemsOfObjective();
    expect(items).toHaveLength(2);
    // Everything except the statement is the new Control Item's own.
    expect(items[1].unit).toBe("PERCENT");
    expect(items[1].dicOrgUnitId).toBe(fx.orgUnits.beta);
    expect(items[0].unit).toBe("INDEX");
    expect(items[0].dicOrgUnitId).toBe(fx.orgUnits.alpha);
    // And its code is its own, so a formula can address either.
    expect(items[1].code).not.toBe(items[0].code);
  });

  it("renames every Control Item at once, because the statement is the Objective's", async () => {
    await addControlItemToObjective(secondItem());

    const result = await updateControlItem({
      id: firstItemId,
      name: "Ownership experience",
      measuredAs: "NPS",
      unit: "INDEX",
      direction: "HIGHER_BETTER",
      aggregation: "AVERAGE",
      decimalPlaces: 0,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    expect(result.ok).toBe(true);

    const objective = await prisma.node.findUniqueOrThrow({ where: { id: objectiveId } });
    expect(objective.statement).toBe("Ownership experience");
    expect(await itemsOfObjective()).toHaveLength(2);
  });

  it("leaves the statement alone when the form did not offer it", async () => {
    // The form opened from a Control Item that is not the Objective's first
    // has no name field, so it sends none - and that must not blank the
    // statement.
    const second = await addControlItemToObjective(secondItem());

    const result = await updateControlItem({
      id: (second as { id: string }).id,
      measuredAs: "% fixed at first visit",
      unit: "PERCENT",
      direction: "HIGHER_BETTER",
      aggregation: "AVERAGE",
      decimalPlaces: 1,
      dicOrgUnitId: fx.orgUnits.alpha,
      businessUnitId: fx.businessUnits.AUTO,
    });
    expect(result.ok).toBe(true);

    const objective = await prisma.node.findUniqueOrThrow({ where: { id: objectiveId } });
    expect(objective.statement).toBe("Service experience");
    const items = await itemsOfObjective();
    expect(items[1].measuredAs).toBe("% fixed at first visit");
  });

  it("keeps the Objective when one of several Control Items is deleted", async () => {
    await addControlItemToObjective(secondItem());

    expect((await deleteControlItem({ id: firstItemId })).ok).toBe(true);
    expect(await prisma.node.count({ where: { id: objectiveId } })).toBe(1);
    expect(await itemsOfObjective()).toHaveLength(1);
  });

  it("keeps the Objective standing when its last Control Item leaves", async () => {
    // The behaviour the flattening introduced. An Objective is a statement of
    // intent in its own right: with nothing measuring it, it reads as a blank
    // row on the sheet - which is a real hole in the deployment, and the one
    // thing worse than showing it would be hiding it.
    expect((await deleteControlItem({ id: firstItemId })).ok).toBe(true);
    expect(await prisma.node.count({ where: { id: objectiveId } })).toBe(1);
    expect(await itemsOfObjective()).toHaveLength(0);
  });

  it("refuses an OWNER adding to a company-level Objective", async () => {
    // The Objective sits at Level 3 under the fixture's Level 2, which is
    // company-wide whichever division somebody leads - the same rule as adding
    // the first one.
    asUser(fx.users.ownerAlpha);
    const result = await addControlItemToObjective(secondItem());
    expect(result.ok).toBe(false);
    expect(await itemsOfObjective()).toHaveLength(1);
  });

  it("reorders an Objective's own Control Items without moving the Objective", async () => {
    const second = await addControlItemToObjective(secondItem());
    const secondId = (second as { id: string }).id;

    const before = await prisma.node.findUniqueOrThrow({ where: { id: objectiveId } });
    expect((await reorderRow({ kind: "MEASURE", id: secondId, beforeId: firstItemId })).ok).toBe(
      true,
    );

    expect((await itemsOfObjective()).map((item) => item.id)).toEqual([secondId, firstItemId]);
    // The Objective itself has not moved among its siblings.
    const after = await prisma.node.findUniqueOrThrow({ where: { id: objectiveId } });
    expect(after.sortOrder).toBe(before.sortOrder);
  });
});
