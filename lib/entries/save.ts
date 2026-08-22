/**
 * Writing a cell.
 *
 * Every write goes through here, and every write:
 *   - checks the role and ownership rules server-side
 *   - refuses any entry on a locked version, for every role including ADMIN
 *   - writes an append-only audit row
 *   - recomputes any formula cells downstream of the change
 *
 * raw_value and formula are mutually exclusive on a given entry.
 */

import { prisma } from "@/lib/db";
import { canEditControlItem } from "@/lib/auth/permissions";
import { NotPermittedError } from "@/lib/auth/errors";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { periodToDate, type PeriodKey } from "@/lib/domain/period";
import { recomputeDependents, saveFormula } from "@/lib/formula/engine";

export class VersionLockedError extends NotPermittedError {
  constructor(versionCode: string) {
    super(`${versionCode} is locked. Its values are read-only.`);
    this.name = "VersionLockedError";
  }
}

export interface SaveEntryInput {
  controlItemId: string;
  period: PeriodKey;
  planVersionId: string;
  /** A number, a formula string beginning "=", or null to clear the cell. */
  input: string | number | null;
}

export interface SaveEntryResult {
  entryId: string;
  value: number | null;
  formula: string | null;
  error: string | null;
  /** Cells recomputed as a consequence of this write. */
  recomputed: Array<{ entryId: string; value: number | null; error: string | null }>;
}

export async function saveEntry(
  user: AuthenticatedUser,
  input: SaveEntryInput,
): Promise<SaveEntryResult> {
  if (!(await canEditControlItem(user, input.controlItemId))) {
    throw new NotPermittedError("You are not responsible for this Control Item.");
  }

  const version = await prisma.planVersion.findUniqueOrThrow({
    where: { id: input.planVersionId },
  });
  // Locked means locked. There is no admin override: a closed version is the
  // record of what was committed, and editing it would rewrite history.
  if (version.lockedAt) throw new VersionLockedError(version.code);

  const period = periodToDate(input.period);
  const existing = await prisma.entry.findUnique({
    where: {
      controlItemId_period_planVersionId: {
        controlItemId: input.controlItemId,
        period,
        planVersionId: input.planVersionId,
      },
    },
  });

  const parsed = parseInput(input.input);

  if (parsed.kind === "FORMULA") {
    const result = await saveFormula({
      controlItemId: input.controlItemId,
      period: input.period,
      planVersionId: input.planVersionId,
      formula: parsed.formula,
      userId: user.id,
    });
    return result;
  }

  const entry = await prisma.entry.upsert({
    where: {
      controlItemId_period_planVersionId: {
        controlItemId: input.controlItemId,
        period,
        planVersionId: input.planVersionId,
      },
    },
    update: {
      rawValue: parsed.value,
      formula: null,
      computedValue: null,
      errorCode: null,
      errorMessage: null,
      updatedById: user.id,
    },
    create: {
      controlItemId: input.controlItemId,
      period,
      planVersionId: input.planVersionId,
      rawValue: parsed.value,
      updatedById: user.id,
    },
  });

  await prisma.entryAudit.create({
    data: {
      entryId: entry.id,
      oldValue: existing?.formula ? existing.computedValue : existing?.rawValue ?? null,
      newValue: parsed.value,
      oldFormula: existing?.formula ?? null,
      newFormula: null,
      changedById: user.id,
    },
  });

  // Clearing the formula also drops its edges out of the dependency graph.
  if (existing?.formula) {
    await prisma.entryDependency.deleteMany({ where: { dependentEntryId: entry.id } });
  }

  const recomputed = await recomputeDependents(entry.id);

  return {
    entryId: entry.id,
    value: parsed.value,
    formula: null,
    error: null,
    recomputed,
  };
}

type ParsedInput = { kind: "VALUE"; value: number | null } | { kind: "FORMULA"; formula: string };

export function parseInput(input: string | number | null): ParsedInput {
  if (input === null) return { kind: "VALUE", value: null };
  if (typeof input === "number") {
    return { kind: "VALUE", value: Number.isFinite(input) ? input : null };
  }

  const trimmed = input.trim();
  if (trimmed === "") return { kind: "VALUE", value: null };
  if (trimmed.startsWith("=")) return { kind: "FORMULA", formula: trimmed };

  // Accept thousands separators as typed, but nothing else: a value that does
  // not parse cleanly is rejected rather than silently becoming zero.
  const cleaned = trimmed.replace(/,/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`"${input}" is not a number. Enter a number, or a formula beginning with "=".`);
  }
  return { kind: "VALUE", value };
}
