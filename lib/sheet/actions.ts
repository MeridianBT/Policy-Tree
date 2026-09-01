"use server";

/**
 * Server actions the sheet screens call when the version selection changes.
 * Reading the sheet is not restricted by role - every signed-in user may see
 * the company page - but authentication is still required.
 */

import { requireSession } from "@/lib/auth/session";
import { activeKiId } from "@/lib/ki/active";
import { loadSheet } from "./query";
import type { SheetModel } from "./types";

/**
 * Re-read the sheet for the screens that change what they are showing without
 * a navigation - a different target version, Level 4 folded in, a row added.
 *
 * The year defaults the same way the pages do, and that default is the point.
 * Without it this action fell back to whichever Ki is marked current, so
 * somebody working on next year's draft would toggle "+ Departments" and get
 * the live year's rows back under a heading still reading DRAFT YEAR - the
 * one mistake the whole switcher exists to prevent. Callers may still name a
 * Ki explicitly; nothing else may quietly mean "the live one".
 */
export async function fetchSheet(input: {
  levels: number[];
  targetVersionId?: string | null;
  orgUnitIds?: string[];
  kiId?: string;
}): Promise<SheetModel> {
  await requireSession();
  return loadSheet({
    levels: input.levels,
    targetVersionId: input.targetVersionId ?? null,
    orgUnitIds: input.orgUnitIds,
    kiId: input.kiId ?? (await activeKiId()),
  });
}
