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
 * So an admin, and only an admin, may point themselves at another Ki. The
 * choice lives in a cookie rather than the database: it is one person's view,
 * not a property of the year, and it must never leak into what anybody else
 * sees. Everyone else always gets the current Ki, whatever is in their cookie.
 *
 * Background work - month-end reminders - deliberately never consults this.
 * A scheduler has no cookie and no person, and chasing people about a draft
 * year would be worse than useless.
 */

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

const COOKIE = "hoshin.ki";

/**
 * The Ki id to load, or undefined for "whichever is current".
 *
 * Undefined for any non-admin, for a stale cookie naming a deleted Ki, and for
 * a cookie naming the current Ki anyway - so the common path stays exactly as
 * it was before this existed, and loadSheet's own default takes over.
 */
export async function activeKiId(): Promise<string | undefined> {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return undefined;

  const chosen = (await cookies()).get(COOKIE)?.value;
  if (!chosen) return undefined;

  // Re-read rather than trust the cookie: it is client-supplied, and the Ki
  // it names may have been deleted since it was set.
  const ki = await prisma.ki.findUnique({
    where: { id: chosen },
    select: { id: true, isCurrent: true },
  });
  if (!ki || ki.isCurrent) return undefined;
  return ki.id;
}

/** The Ki actually on screen, for anything that needs to say which. */
export async function activeKi() {
  const id = await activeKiId();
  return id
    ? prisma.ki.findUnique({ where: { id } })
    : ((await prisma.ki.findFirst({ where: { isCurrent: true } })) ??
        (await prisma.ki.findFirst({ orderBy: { startDate: "desc" } })));
}

/** Admin-only. Passing null returns them to the current Ki. */
export async function setActiveKi(kiId: string | null): Promise<void> {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return;

  const jar = await cookies();
  if (!kiId) jar.delete(COOKIE);
  else jar.set(COOKIE, kiId, { httpOnly: true, sameSite: "lax", path: "/" });
}
