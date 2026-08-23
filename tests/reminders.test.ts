/**
 * The one reminder property that cannot be unit-tested: nobody is chased
 * twice for the same month.
 *
 * The guard is a unique constraint on (user, period) claimed before sending,
 * so proving it needs a real database. Everything else about reminders - who
 * is accountable, which month, what the mail says - is pure and covered in
 * lib/calc/reminders.test.ts.
 *
 * Runs against the seeded Ki rather than a fixture, because the reminder
 * scope deliberately resolves the *current* Ki and a fixture would have to
 * steal that flag from the seed. It picks a month with no actuals keyed and
 * removes its own log rows afterwards.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./fixture";
import { periodToDate } from "../lib/domain/period";
import { runReminders } from "../lib/reminders/send";
import { RecordingMailer } from "../lib/reminders/mailer";

// The last month of the seeded Ki. Actuals are seeded through the first half
// only, so this one is entirely unkeyed.
const PERIOD = "2027-03";

async function clearLog() {
  await prisma.reminderLog.deleteMany({ where: { period: periodToDate(PERIOD) } });
}

beforeAll(clearLog);

afterAll(async () => {
  await clearLog();
  await prisma.$disconnect();
});

describe("runReminders", () => {
  it("reminds the people accountable for unkeyed measures, once", async () => {
    const mailer = new RecordingMailer();
    const result = await runReminders({ period: PERIOD, mailer, appUrl: "https://example.test" });

    expect(result.period).toBe(PERIOD);
    expect(result.sent).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
    expect(mailer.sent).toHaveLength(result.sent);
    // One mail per person, never one per measure.
    expect(new Set(mailer.sent.map((m) => m.to)).size).toBe(mailer.sent.length);
  });

  it("does not chase the same people again on a second run", async () => {
    const mailer = new RecordingMailer();
    const result = await runReminders({ period: PERIOD, mailer, appUrl: "https://example.test" });

    expect(result.sent).toBe(0);
    expect(result.alreadySent).toBeGreaterThan(0);
    expect(mailer.sent).toEqual([]);
  });

  it("records what it sent, so 'I was never told' has an answer", async () => {
    const rows = await prisma.reminderLog.findMany({
      where: { period: periodToDate(PERIOD) },
      select: { status: true, outstandingCount: true },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === "SENT")).toBe(true);
    expect(rows.every((row) => row.outstandingCount > 0)).toBe(true);
  });

  it("re-sends only when asked to, deliberately", async () => {
    const mailer = new RecordingMailer();
    const result = await runReminders({
      period: PERIOD,
      force: true,
      mailer,
      appUrl: "https://example.test",
    });

    expect(result.sent).toBeGreaterThan(0);
    expect(result.alreadySent).toBe(0);
  });

  it("never writes a log row on a dry run, so a real run afterwards still sends", async () => {
    await clearLog();

    const mailer = new RecordingMailer();
    const dry = await runReminders({
      period: PERIOD,
      dryRun: true,
      mailer,
      appUrl: "https://example.test",
    });

    expect(dry.sent).toBeGreaterThan(0);
    expect(await prisma.reminderLog.count({ where: { period: periodToDate(PERIOD) } })).toBe(0);

    // The real run that follows must still reach everyone.
    const live = await runReminders({
      period: PERIOD,
      mailer: new RecordingMailer(),
      appUrl: "https://example.test",
    });
    expect(live.sent).toBe(dry.sent);
  });

  it("addresses each mail to the person it is about", async () => {
    await clearLog();
    const mailer = new RecordingMailer();
    await runReminders({ period: PERIOD, dryRun: true, mailer, appUrl: "https://example.test" });

    for (const message of mailer.sent) {
      expect(message.to).toContain("@");
      expect(message.subject).toContain("Mar 2027");
      expect(message.html).toContain("https://example.test/my-entries");
    }
  });
});
