"use server";

/**
 * Which Ki the signed-in person is looking at.
 *
 * Normally there is nothing to decide: everyone sees the Ki marked current,
 * and that is the year the company is running. But a new year has to be built
 * before it starts - next year's Goals typed in, last year's structure copied
 * across, targets loaded - and doing that by flipping `is_current` would move
 * every user onto a half-built year mid-review.
 *
 * So a SUPER_ADMIN or an EXECUTIVE may point themselves at another Ki. The
 * choice lives in a cookie rather than the database: it is one person's view,
 * not a property of the year, and it must never leak into what anybody else
 * sees. Everyone else always gets the current Ki, whatever is in their cookie.
 *
 * An EXECUTIVE reaches forward only. Building next year is their job; a past
 * year is the record of what happened and belongs to a SUPER_ADMIN alone. The
 * cookie is client-supplied, so that reach is re-derived here on every read
 * rather than trusted from whatever set it.
 *
 * Background work - month-end reminders - deliberately never consults this.
 * A scheduler has no cookie and no person, and chasing people about a draft
 * year would be worse than useless.
 */

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isPriorYear } from "@/lib/auth/permissions";

const COOKIE = "hoshin.ki";

/**
 * The Ki id to load, or undefined for "whichever is current".
 *
 * Undefined for anyone who may not switch, for a stale cookie naming a deleted
 * Ki, for a year out of the viewer's reach, and for a cookie naming the current
 * Ki anyway - so the common path stays exactly as it was before this existed,
 * and loadSheet's own default takes over.
 */
export async function activeKiId(): Promise<string | undefined> {
  const user = await getCurrentUser();
  if (!user || !maySwitchKi(user.role)) return undefined;

  const chosen = (await cookies()).get(COOKIE)?.value;
  if (!chosen) return undefined;

  // Re-read rather than trust the cookie: it is client-supplied, and the Ki
  // it names may have been deleted since it was set.
  const ki = await prisma.ki.findUnique({
    where: { id: chosen },
    select: { id: true, isCurrent: true },
  });
  if (!ki || ki.isCurrent) return undefined;
  if (!(await withinReach(user.role, ki.id))) return undefined;
  return ki.id;
}

function maySwitchKi(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "EXECUTIVE";
}

/**
 * A SUPER_ADMIN reaches every year. An EXECUTIVE reaches everything from the
 * current year forward - next year's plan, not last year's record. One
 * definition of "prior year", shared with the permission module, so the
 * switcher can never offer a year the server would then refuse to edit.
 */
async function withinReach(role: string, kiId: string): Promise<boolean> {
  if (role === "SUPER_ADMIN") return true;
  return !(await isPriorYear(kiId));
}

/** The years this person may point themselves at, for the switcher's own list. */
export async function selectableKis() {
  const user = await getCurrentUser();
  if (!user || !maySwitchKi(user.role)) return [];

  const all = await prisma.ki.findMany({ orderBy: { startDate: "asc" } });
  if (user.role === "SUPER_ADMIN") return all;

  const current = all.find((ki) => ki.isCurrent);
  if (!current) return all;
  return all.filter((ki) => ki.startDate >= current.startDate);
}

/** The Ki actually on screen, for anything that needs to say which. */
export async function activeKi() {
  const id = await activeKiId();
  return id
    ? prisma.ki.findUnique({ where: { id } })
    : ((await prisma.ki.findFirst({ where: { isCurrent: true } })) ??
        (await prisma.ki.findFirst({ orderBy: { startDate: "desc" } })));
}

/** SUPER_ADMIN or EXECUTIVE only. Passing null returns them to the current Ki. */
export async function setActiveKi(kiId: string | null): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !maySwitchKi(user.role)) return;
  if (kiId && !(await withinReach(user.role, kiId))) return;

  const jar = await cookies();
  if (!kiId) jar.delete(COOKIE);
  else jar.set(COOKIE, kiId, { httpOnly: true, sameSite: "lax", path: "/" });
}
