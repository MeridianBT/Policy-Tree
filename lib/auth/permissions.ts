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
 * ADMIN  - anything
 * OWNER  - Control Items they are named responsible for, or any Control Item
 *          whose DIC is their own org unit or a descendant of it, so that a
 *          division lead covers their departments
 * VIEWER - nothing
 *
 * This is the single definition; every mutation path routes through it.
 */
export async function canEditControlItem(
  user: AuthenticatedUser,
  controlItemId: string,
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
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
 * ADMIN  - anything, at any level
 * OWNER  - Level 4 only, and only within their own org unit or a department
 *          beneath it. A division or department lead runs their own corner of
 *          the deployment; the company-wide Levels 1-3 stay ADMIN territory,
 *          because they are what every division ladders into and a local edit
 *          there would move the ground under everyone else.
 * VIEWER - never
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
  if (user.role === "ADMIN") return true;
  if (user.role !== "OWNER") return false;
  if (level < 4) return false;
  if (!user.orgUnitId || !orgUnitId) return false;
  return orgUnitCovers(user.orgUnitId, orgUnitId);
}

/**
 * Which org units a user may file a new Level 4 branch or Control Item under.
 * ADMIN sees every Division and Department; an OWNER sees only their own org
 * unit and whatever sits beneath it, which is what keeps a division lead from
 * quietly filing a measure under someone else's department.
 */
export async function assignableOrgUnitIds(user: AuthenticatedUser): Promise<string[] | "ALL"> {
  if (user.role === "ADMIN") return "ALL";
  if (user.role !== "OWNER" || !user.orgUnitId) return [];
  return orgUnitSubtree(user.orgUnitId);
}
