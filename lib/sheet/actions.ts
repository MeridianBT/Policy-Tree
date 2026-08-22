"use server";

/**
 * Server actions the sheet screens call when the version selection changes.
 * Reading the sheet is not restricted by role - every signed-in user may see
 * the company page - but authentication is still required.
 */

import { requireSession } from "@/lib/auth/session";
import { loadSheet } from "./query";
import type { SheetModel } from "./types";

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
    kiId: input.kiId,
  });
}
