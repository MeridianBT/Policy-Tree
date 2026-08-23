/**
 * Run the month-end reminders from a shell.
 *
 * The same work the API route does, for a cron box, a one-off catch-up, or
 * checking who *would* be chased before pointing it at a live mailbox:
 *
 *   npm run remind -- --dry-run
 *   npm run remind -- --period=2026-04
 *   npm run remind -- --period=2026-04 --force
 *
 * Defaults to a dry run. Actually sending mail to real people is something
 * you should have to ask for.
 */

import "dotenv/config";
import { runReminders } from "../lib/reminders/send";

function flag(name: string): string | undefined {
  const match = process.argv.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!match) return undefined;
  return match.includes("=") ? match.split("=").slice(1).join("=") : "true";
}

async function main() {
  const send = flag("send") === "true";
  const dryRun = !send;
  const period = flag("period");
  const force = flag("force") === "true";

  if (period && !/^\d{4}-\d{2}$/.test(period)) {
    console.error(`--period must look like 2026-04, got "${period}".`);
    process.exit(1);
  }

  console.log(dryRun ? "Dry run — nothing will be sent. Pass --send to deliver." : "Sending.");

  const result = await runReminders({ period, dryRun, force });

  if (!result.period) {
    console.log("No Ki with an actuals version — nothing to do.");
    return;
  }

  console.log(
    [
      ``,
      `Ki:                 ${result.kiCode}`,
      `Month:              ${result.period}`,
      `Outstanding:        ${result.outstandingTotal} measures`,
      `${dryRun ? "Would remind:      " : "Reminded:          "} ${result.sent} people`,
      `Already reminded:   ${result.alreadySent}`,
      `Failed:             ${result.failed}`,
      `Nobody accountable: ${result.unassigned} measures`,
    ].join("\n"),
  );

  for (const failure of result.errors) {
    console.error(`  ! ${failure.email}: ${failure.error}`);
  }

  // A failed send is a real failure - a scheduler should see a non-zero exit
  // rather than a green tick over an empty inbox.
  if (result.failed > 0) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../lib/db");
    await prisma.$disconnect();
  });
