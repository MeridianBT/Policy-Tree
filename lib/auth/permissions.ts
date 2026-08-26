/**
 * Who may change what.
 *
 * These are domain rules over the database, deliberately free of any Auth.js
 * dependency: they take an already-authenticated user and answer a question.
 * That keeps them testable directly, and keeps the identity provider swappable
 * without touching a single permission rule.
 */

import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "./types";

/**
 * Whether a user may key a number into a Control Item.
 *
 * SUPER_ADMIN - anything
 * EXECUTIVE   - anything, company-wide. A director is answerable for the plan
 *               as a whole, so nothing here is scoped to an org unit. What
 *               still stops them is the version lock (lib/entries/save.ts) and
 *               the year reach (`canEditInKi`), both enforced separately -
 *               this function answers "may they touch this measure", not "is
 *               this cell open".
 * OWNER       - Control Items they are named responsible for, or any Control
 *               Item whose DIC is their own org unit or a descendant of it,
 *               so that a division lead covers their departments
 * VIEWER      - nothing
 *
 * This is the single definition; every mutation path routes through it.
 */
export async function canEditControlItem(
  user: AuthenticatedUser,
  controlItemId: string,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN" || user.role === "EXECUTIVE") return true;
  if (user.role !== "OWNER") return false;

  const controlItem = await prisma.controlItem.findUnique({
    where: { id: controlItemId },
    select: { responsibleUserId: true, dicOrgUnitId: true },
  });
  if (!controlItem) return false;
  if (controlItem.responsibleUserId === user.id) return true;
  if (!user.orgUnitId) return false;

  return orgUnitCovers(user.orgUnitId, controlItem.dicOrgUnitId);
}

/** True when `ancestorId` is `orgUnitId` itself or an ancestor of it. */
export async function orgUnitCovers(ancestorId: string, orgUnitId: string): Promise<boolean> {
  let current: string | null = orgUnitId;
  // Depth is bounded by the org tree (company > division > department).
  for (let depth = 0; current && depth < 10; depth++) {
    if (current === ancestorId) return true;
    const unit: { parentId: string | null } | null = await prisma.orgUnit.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = unit?.parentId ?? null;
  }
  return false;
}

/** Every org unit id at or beneath the given one. */
export async function orgUnitSubtree(orgUnitId: string): Promise<string[]> {
  const ids = [orgUnitId];
  let frontier = [orgUnitId];
  for (let depth = 0; frontier.length && depth < 10; depth++) {
    const children = await prisma.orgUnit.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((child) => child.id);
    ids.push(...frontier);
  }
  return ids;
}

// ------------------------------------------------------------ Structure edits

/**
 * Whether a user may add, rename or remove a piece of the plan structure.
 *
 * SUPER_ADMIN - anything, at any level
 * EXECUTIVE   - Levels 1 to 3, the company-wide structure, anywhere in it.
 *               Deliberately NOT Level 4: a department's branch belongs to
 *               the lead who built it, and a director quietly renaming
 *               someone's row would undo the one piece of the plan an OWNER
 *               genuinely owns. Deleting a Level 1-3 row whose descendants
 *               include Level 4 branches is still permitted - that is an
 *               announced, confirmed, whole-branch act that names what it
 *               removes, which is a different thing from editing one row in
 *               place.
 * OWNER       - Level 4 only, and only within their own org unit or a
 *               department beneath it. A division or department lead runs
 *               their own corner of the deployment; the company-wide Levels
 *               1-3 are what every division ladders into and a local edit
 *               there would move the ground under everyone else.
 * VIEWER      - never
 *
 * `orgUnitId` is the org unit the row in question belongs to (a Level 4 node's
 * own `orgUnitId`, or a Control Item's `dicOrgUnitId`). Absent, an OWNER cannot
 * act - there is nothing to scope the edit to.
 */
export async function canEditStructureAt(
  user: AuthenticatedUser,
  level: number,
  orgUnitId: string | null,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "EXECUTIVE") return level >= 1 && level <= 3;
  if (user.role !== "OWNER") return false;
  if (level < 4) return false;
  if (!user.orgUnitId || !orgUnitId) return false;
  return orgUnitCovers(user.orgUnitId, orgUnitId);
}

/**
 * Whether a role may change anything at all in a given Ki.
 *
 * The year is a separate axis from the level and the lock, and the rule on it
 * is narrow: a *prior* year is the record of what happened, and only a
 * SUPER_ADMIN may touch it. The sanctioned way to do so is Admin -> Empty
 * year, which has its own two guards.
 *
 * Everything from the current year forward is open to whoever the level and
 * lock rules already allow. That matters for a *future* Ki in particular:
 * next year's plan is built before it starts, and building it is exactly an
 * EXECUTIVE's job.
 *
 * Note this deliberately keys off "started before the current year", not
 * "is not the current year". A Ki nobody has marked current yet is not a
 * prior year, and refusing edits on it would lock everyone out of the only
 * plan they have.
 */
export async function canEditInKi(user: AuthenticatedUser, kiId: string): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "VIEWER") return false;
  return !(await isPriorYear(kiId));
}

/** True when this Ki started before the one currently being run. */
export async function isPriorYear(kiId: string): Promise<boolean> {
  const [ki, current] = await Promise.all([
    prisma.ki.findUnique({ where: { id: kiId }, select: { isCurrent: true, startDate: true } }),
    prisma.ki.findFirst({ where: { isCurrent: true }, select: { startDate: true } }),
  ]);
  if (!ki) return false;
  if (ki.isCurrent) return false;
  // With no current year there is nothing for a year to be prior to.
  if (!current) return false;
  return ki.startDate < current.startDate;
}

/**
 * Which org units a user may file a new Level 4 branch or Control Item under.
 * SUPER_ADMIN and EXECUTIVE see every Division and Department; an OWNER sees
 * only their own org unit and whatever sits beneath it, which is what keeps a
 * division lead from quietly filing a measure under someone else's department.
 */
export async function assignableOrgUnitIds(user: AuthenticatedUser): Promise<string[] | "ALL"> {
  if (user.role === "SUPER_ADMIN" || user.role === "EXECUTIVE") return "ALL";
  if (user.role !== "OWNER" || !user.orgUnitId) return [];
  return orgUnitSubtree(user.orgUnitId);
}
