/**
 * "My entries" - the screen that decides whether the system actually gets used.
 *
 * A user sees every Control Item they are named responsible for, plus every
 * Control Item whose DIC sits at or beneath their own org unit, which is what
 * makes a division lead able to key their departments' numbers.
 */

import { prisma } from "@/lib/db";
import { dateToPeriod, kiStartYearOf, kiMonths, periodToDate, type PeriodKey } from "@/lib/domain/period";
import { orgUnitSubtree } from "@/lib/auth/permissions";
import type { Unit } from "@/lib/calc/types";

export interface OutstandingEntry {
  controlItemId: string;
  code: string;
  name: string;
  unit: Unit;
  decimalPlaces: number;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  dicCode: string;
  objective: string;
  period: PeriodKey;
  planVersionId: string;
  /** The actual as keyed so far, null when nothing has been entered. */
  value: number | null;
  formula: string | null;
  /** The latest-forecast target for the same month, shown for context. */
  target: number | null;
  entryId: string | null;
  locked: boolean;
}

/**
 * The month owners are currently keying: the most recent month of the current
 * Ki that has already started. Before the Ki opens this is its first month;
 * after it closes, its last.
 */
export function openMonth(kiStartYear: number, today = new Date()): PeriodKey {
  const months = kiMonths(kiStartYear);
  const current = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  if (current < months[0]) return months[0];
  if (current > months[months.length - 1]) return months[months.length - 1];
  return current;
}

export async function outstandingForUser(
  userId: string,
  options?: { period?: PeriodKey },
): Promise<OutstandingEntry[]> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { id: true, role: true, orgUnitId: true },
  });
  if (!user) return [];

  const ki =
    (await prisma.ki.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.ki.findFirst({ orderBy: { startDate: "desc" } }));
  if (!ki) return [];

  const kiStartYear = kiStartYearOf(dateToPeriod(ki.startDate));
  const period = options?.period ?? openMonth(kiStartYear);

  const actVersion = await prisma.planVersion.findFirst({ where: { kiId: ki.id, isActual: true } });
  if (!actVersion) return [];

  const coveredOrgUnits = user.orgUnitId ? await orgUnitSubtree(user.orgUnitId) : [];

  const controlItems = await prisma.controlItem.findMany({
    where: {
      node: { kiId: ki.id },
      ...(user.role === "ADMIN"
        ? {}
        : {
            OR: [
              { responsibleUserId: user.id },
              ...(coveredOrgUnits.length ? [{ dicOrgUnitId: { in: coveredOrgUnits } }] : []),
            ],
          }),
    },
    include: {
      dicOrgUnit: { select: { code: true } },
      node: { select: { statement: true } },
    },
    orderBy: [{ dicOrgUnitId: "asc" }, { sortOrder: "asc" }],
  });
  if (controlItems.length === 0) return [];

  const controlItemIds = controlItems.map((item) => item.id);
  const periodDate = periodToDate(period);

  const [actuals, versions, forecastEntries] = await Promise.all([
    prisma.entry.findMany({
      where: { controlItemId: { in: controlItemIds }, period: periodDate, planVersionId: actVersion.id },
    }),
    prisma.planVersion.findMany({
      where: { kiId: ki.id, isActual: false },
      orderBy: { sequence: "desc" },
    }),
    prisma.entry.findMany({
      where: {
        controlItemId: { in: controlItemIds },
        period: periodDate,
        planVersion: { isActual: false },
      },
      select: { controlItemId: true, planVersionId: true, rawValue: true, computedValue: true, formula: true },
    }),
  ]);

  const actualByItem = new Map(actuals.map((entry) => [entry.controlItemId, entry]));

  // Latest forecast for this one month: highest sequence with a value.
  const targetByItem = new Map<string, number>();
  for (const version of versions) {
    for (const entry of forecastEntries) {
      if (entry.planVersionId !== version.id) continue;
      if (targetByItem.has(entry.controlItemId)) continue;
      const stored = entry.formula ? entry.computedValue : entry.rawValue;
      if (stored !== null && stored !== undefined) {
        targetByItem.set(entry.controlItemId, Number(stored));
      }
    }
  }

  return controlItems.map((item) => {
    const actual = actualByItem.get(item.id);
    const stored = actual ? (actual.formula ? actual.computedValue : actual.rawValue) : null;
    return {
      controlItemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      decimalPlaces: item.decimalPlaces,
      direction: item.direction,
      dicCode: item.dicOrgUnit.code,
      objective: item.node.statement,
      period,
      planVersionId: actVersion.id,
      value: stored === null || stored === undefined ? null : Number(stored),
      formula: actual?.formula ?? null,
      target: targetByItem.get(item.id) ?? null,
      entryId: actual?.id ?? null,
      locked: actVersion.lockedAt != null,
    };
  });
}

export async function currentKiMonths(): Promise<{ kiCode: string; months: PeriodKey[]; openMonth: PeriodKey }> {
  const ki =
    (await prisma.ki.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.ki.findFirst({ orderBy: { startDate: "desc" } }));
  if (!ki) throw new Error("No Ki has been set up.");
  const kiStartYear = kiStartYearOf(dateToPeriod(ki.startDate));
  return { kiCode: ki.code, months: kiMonths(kiStartYear), openMonth: openMonth(kiStartYear) };
}
