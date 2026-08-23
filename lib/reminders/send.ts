/**
 * The reminder run itself.
 *
 * Three rules shape it.
 *
 * Nobody is chased twice for the same month. `reminder_log` has a unique
 * constraint on (user, period) and this claims the row *before* sending, so
 * two runs racing each other end with one mail, not two. The claim is what
 * makes the endpoint safe to expose to a scheduler that retries.
 *
 * One person's failure does not stop the run. A bad address should not mean
 * forty other people go unchased, so failures are recorded against that
 * recipient and the run continues.
 *
 * A dry run writes nothing at all. It resolves the same recipients and
 * renders the same messages, so "who would this chase, and with what?" is
 * answerable before anyone points it at a live mailbox - but it must not
 * consume the (user, period) slot, or the real run that follows would find
 * everyone already reminded and mail nobody.
 */

import { prisma } from "@/lib/db";
import { periodToDate, type PeriodKey } from "@/lib/domain/period";
import { buildReminderMessage } from "./message";
import { GraphMailer, graphConfigured, RecordingMailer, type Mailer } from "./mailer";
import { buildReminderScope } from "./recipients";

export interface ReminderRunResult {
  period: PeriodKey | null;
  kiCode: string | null;
  dryRun: boolean;
  sent: number;
  failed: number;
  /** Already reminded for this month by an earlier run. */
  alreadySent: number;
  /** Outstanding measures nobody active is accountable for. */
  unassigned: number;
  outstandingTotal: number;
  errors: Array<{ email: string; error: string }>;
}

export interface ReminderRunOptions {
  period?: PeriodKey;
  today?: Date;
  dryRun?: boolean;
  /** Re-send even where a log row already exists. Deliberate, never default. */
  force?: boolean;
  mailer?: Mailer;
  appUrl?: string;
}

export async function runReminders(options: ReminderRunOptions = {}): Promise<ReminderRunResult> {
  const dryRun = options.dryRun ?? false;
  const scope = await buildReminderScope({ period: options.period, today: options.today });

  const empty: ReminderRunResult = {
    period: null,
    kiCode: null,
    dryRun,
    sent: 0,
    failed: 0,
    alreadySent: 0,
    unassigned: 0,
    outstandingTotal: 0,
    errors: [],
  };
  if (!scope) return empty;

  const appUrl = options.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const mailer = options.mailer ?? (dryRun ? new RecordingMailer() : new GraphMailer());
  if (!dryRun && !options.mailer && !graphConfigured()) {
    throw new Error(
      "Microsoft Graph is not configured: set GRAPH_TENANT_ID, GRAPH_CLIENT_SECRET and REMINDER_FROM.",
    );
  }

  const result: ReminderRunResult = {
    ...empty,
    period: scope.period,
    kiCode: scope.kiCode,
    unassigned: scope.unassigned.length,
    outstandingTotal: scope.unkeyed.length,
  };

  const periodDate = periodToDate(scope.period);
  const force = options.force ?? false;

  // Read once for the dry-run path, which must not write anything.
  const alreadyLogged = dryRun
    ? new Set(
        (
          await prisma.reminderLog.findMany({
            where: { period: periodDate, status: "SENT" },
            select: { userId: true },
          })
        ).map((row) => row.userId),
      )
    : new Set<string>();

  for (const recipient of scope.recipients) {
    if (dryRun) {
      if (alreadyLogged.has(recipient.userId) && !force) {
        result.alreadySent += 1;
        continue;
      }
      await mailer.send(
        buildReminderMessage(recipient, { period: scope.period, kiCode: scope.kiCode, appUrl }),
      );
      result.sent += 1;
      continue;
    }

    // Claim first. Losing this race means another run already has this
    // person for this month, and the right thing is to do nothing.
    const claimed = await claim(recipient.userId, periodDate, recipient.items.length, force);
    if (!claimed) {
      result.alreadySent += 1;
      continue;
    }

    try {
      await mailer.send(
        buildReminderMessage(recipient, { period: scope.period, kiCode: scope.kiCode, appUrl }),
      );
      await prisma.reminderLog.update({
        where: { id: claimed },
        data: { status: "SENT", error: null },
      });
      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Recorded as FAILED rather than deleted, so the failure is visible and
      // a later run with --force can retry it deliberately.
      await prisma.reminderLog.update({
        where: { id: claimed },
        data: { status: "FAILED", error: message.slice(0, 500) },
      });
      result.failed += 1;
      result.errors.push({ email: recipient.email, error: message });
    }
  }

  return result;
}

/**
 * Take the (user, period) slot, returning the log row id, or null when
 * somebody already holds it.
 *
 * The unique constraint is the lock: two runs both reaching this line for the
 * same person means exactly one create succeeds and the other sees P2002.
 */
async function claim(
  userId: string,
  period: Date,
  outstandingCount: number,
  force: boolean,
): Promise<string | null> {
  try {
    const row = await prisma.reminderLog.create({
      // Held as FAILED until the send succeeds, so a run that dies mid-flight
      // leaves behind an honest record rather than claiming a phantom send.
      data: { userId, period, status: "FAILED", outstandingCount },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // A previous attempt that failed is worth retrying without --force: the
    // person was never actually reached, so this is not a second chase.
    const existing = await prisma.reminderLog.findUnique({
      where: { userId_period: { userId, period } },
      select: { id: true, status: true },
    });
    if (!existing) return null;
    if (existing.status === "SENT" && !force) return null;

    await prisma.reminderLog.update({
      where: { id: existing.id },
      data: { status: "FAILED", outstandingCount, error: null, sentAt: new Date() },
    });
    return existing.id;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}
