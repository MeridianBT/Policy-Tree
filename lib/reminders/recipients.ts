/**
 * Who still owes a number for a given month, and what.
 *
 * Deliberately *not* built on `outstandingForUser`. That query gives an ADMIN
 * every Control Item in the Ki, which is right for a screen an admin chose to
 * open and wrong for an email: it would chase one person about thirty-one
 * measures they are not accountable for, which is the fastest way to teach
 * everyone to filter these to trash.
 *
 * Reminders follow accountability only:
 *   - the person named responsible for a Control Item, and
 *   - the lead of the org unit the Control Item's DIC sits in, or any org
 *     unit above it - which is what makes a division lead answerable for
 *     their departments' numbers.
 *
 * The matching itself is a pure function over rows already fetched, so the
 * rule can be tested without a database. `assignRecipients` is the piece
 * worth reading.
 */

import { prisma } from "@/lib/db";
import { dateToPeriod, kiStartYearOf, periodToDate, type PeriodKey } from "@/lib/domain/period";
import { reminderPeriodForKi } from "./period";
import { assignRecipients, subtreeOf, type CandidateUser, type Recipient, type UnkeyedItem } from "./match";
import { controlItemLabel } from "@/lib/calc/measure-label";

export { assignRecipients, subtreeOf } from "./match";
export type { CandidateUser, OutstandingItem, Recipient, UnkeyedItem } from "./match";

export interface ReminderScope {
  kiCode: string;
  period: PeriodKey;
  recipients: Recipient[];
  /** Every unkeyed item, including any nobody is accountable for. */
  unkeyed: UnkeyedItem[];
  /** Unkeyed items no active user covers - a gap worth an admin's attention. */
  unassigned: UnkeyedItem[];
}

/**
 * Everything a reminder run needs, in a fixed number of queries regardless of
 * how many users or measures there are.
 */
export async function buildReminderScope(options?: {
  period?: PeriodKey;
  today?: Date;
}): Promise<ReminderScope | null> {
  const ki =
    (await prisma.ki.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.ki.findFirst({ orderBy: { startDate: "desc" } }));
  if (!ki) return null;

  const kiStartYear = kiStartYearOf(dateToPeriod(ki.startDate));
  const period =
    options?.period ?? reminderPeriodForKi(kiStartYear, options?.today ?? new Date());

  const actVersion = await prisma.planVersion.findFirst({
    where: { kiId: ki.id, isActual: true },
  });
  // No actuals version means there is nothing anyone could key yet.
  if (!actVersion) return null;

  const [controlItems, actuals, users, orgUnits] = await Promise.all([
    prisma.controlItem.findMany({
      where: { measure: { node: { kiId: ki.id } } },
      select: {
        id: true,
        code: true,
        measuredAs: true,
        dicOrgUnitId: true,
        responsibleUserId: true,
        dicOrgUnit: { select: { code: true } },
        measure: {
          select: {
            name: true,
            node: { select: { statement: true } },
            _count: { select: { controlItems: true } },
          },
        },
      },
      orderBy: [{ dicOrgUnitId: "asc" }, { measure: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    prisma.entry.findMany({
      where: { period: periodToDate(period), planVersionId: actVersion.id },
      select: { controlItemId: true, rawValue: true, computedValue: true, formula: true },
    }),
    prisma.appUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true, orgUnitId: true },
    }),
    prisma.orgUnit.findMany({ select: { id: true, parentId: true, type: true } }),
  ]);

  // An entry row that exists but holds no value is still outstanding - the
  // row can be created by keying and then clearing a figure.
  const keyed = new Set(
    actuals
      .filter((entry) => {
        const stored = entry.formula ? entry.computedValue : entry.rawValue;
        return stored !== null && stored !== undefined;
      })
      .map((entry) => entry.controlItemId),
  );

  const unkeyed: UnkeyedItem[] = controlItems
    .filter((item) => !keyed.has(item.id))
    .map((item) => ({
      controlItemId: item.id,
      code: item.code,
      // A chase naming the same measure three times helps nobody, so a
      // measure with several Control Items names which one is outstanding.
      name: controlItemLabel(item.measure.name, item.measuredAs, item.measure._count.controlItems),
      dicCode: item.dicOrgUnit.code,
      objective: item.measure.node.statement,
      dicOrgUnitId: item.dicOrgUnitId,
      responsibleUserId: item.responsibleUserId,
    }));

  const companyRootIds = new Set(
    orgUnits.filter((unit) => unit.type === "COMPANY").map((unit) => unit.id),
  );

  const candidates: CandidateUser[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    orgUnitId: user.orgUnitId,
    atCompanyRoot: user.orgUnitId ? companyRootIds.has(user.orgUnitId) : false,
    covers: user.orgUnitId ? subtreeOf(user.orgUnitId, orgUnits) : [],
  }));

  const recipients = assignRecipients(unkeyed, candidates);
  const claimed = new Set(recipients.flatMap((r) => r.items.map((i) => i.controlItemId)));

  return {
    kiCode: ki.code,
    period,
    recipients,
    unkeyed,
    unassigned: unkeyed.filter((item) => !claimed.has(item.controlItemId)),
  };
}
