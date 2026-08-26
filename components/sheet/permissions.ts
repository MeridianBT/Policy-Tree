/**
 * The client-side mirror of `lib/auth/permissions.ts`'s structure-edit rule.
 *
 * This decides which pencils and trash cans to draw - nothing else. Every
 * server action re-derives the same answer from the database and refuses
 * anything this mirror got wrong, so a stale or manipulated client can hide or
 * show a button but never actually act outside its scope.
 *
 * SUPER_ADMIN - edits anything, always.
 * EXECUTIVE   - edits Levels 1-3, the company-wide structure. Level 4 is
 *               read-only to them: a department's branch belongs to the lead
 *               who built it.
 * OWNER       - edits Level 4 rows within their own org unit or a department
 *               beneath it. Levels 1-3 are read-only to them, because they are
 *               what every division ladders into.
 * VIEWER      - edits nothing.
 *
 * "Add department" is the one exception: it hangs off a Level 2 or 3
 * Objective, which is company-wide and owned by nobody in particular, so
 * anyone but a VIEWER may open the form there - what the form then restricts
 * is *which* org unit the new branch may be filed under.
 */

import type { DicOption } from "./StructureControls";

export interface EditingUser {
  role: "SUPER_ADMIN" | "EXECUTIVE" | "OWNER" | "VIEWER";
  orgUnitId: string | null;
}

/** True when `ancestorId` is `targetId` itself or covers it in the org tree. */
export function orgUnitCoversClient(dics: DicOption[], ancestorId: string, targetId: string): boolean {
  if (ancestorId === targetId) return true;
  const byId = new Map(dics.map((dic) => [dic.id, dic]));
  const byCode = new Map(dics.map((dic) => [dic.code, dic]));

  let current = byId.get(targetId);
  // The org tree is Company > Division > Department, so this loop runs at
  // most once in practice; it is written generically rather than assuming that.
  while (current?.parentCode) {
    const parent = byCode.get(current.parentCode);
    if (!parent) return false;
    if (parent.id === ancestorId) return true;
    current = parent;
  }
  return false;
}

export function canEditStructureAt(
  user: EditingUser,
  dics: DicOption[],
  level: number,
  orgUnitId: string | null | undefined,
): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "EXECUTIVE") return level >= 1 && level <= 3;
  if (user.role !== "OWNER") return false;
  if (level < 4) return false;
  if (!user.orgUnitId || !orgUnitId) return false;
  return orgUnitCoversClient(dics, user.orgUnitId, orgUnitId);
}

/** Whether the "Add department" affordance belongs on this Objective row. */
export function canAddDepartmentBranch(user: EditingUser, row: { kind: string; level: number }): boolean {
  return user.role !== "VIEWER" && row.kind === "OBJECTIVE" && row.level >= 2 && row.level <= 3;
}
