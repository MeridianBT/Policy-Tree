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
