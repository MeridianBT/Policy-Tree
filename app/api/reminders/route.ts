/**
 * The reminder trigger.
 *
 * A POST endpoint rather than a cron job inside the process, because the
 * application is deployed as a container that may run zero or several
 * replicas: an in-process timer would fire once per replica, or never on a
 * platform that sleeps idle instances. Anything that can make an HTTP call on
 * a schedule - an Azure Function timer, a Logic App, a Kubernetes CronJob,
 * plain cron with curl - can drive it, and the (user, period) claim in
 * lib/reminders/send.ts keeps duplicate fires harmless.
 *
 * Authenticated with a shared secret, not a session: there is no user here.
 */

import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders/send";

export const dynamic = "force-dynamic";

/** Constant-time compare, so a wrong secret cannot be found a byte at a time. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function authorised(request: Request): boolean {
  const expected = process.env.REMINDER_TRIGGER_SECRET;
  // Refuse rather than run open: an unset secret is a misconfiguration, and
  // an endpoint that mails the whole company must never be the thing that
  // discovers it.
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  return provided.length > 0 && secretMatches(provided, expected);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? undefined;
  const dryRun = url.searchParams.get("dryRun") === "true";
  const force = url.searchParams.get("force") === "true";

  if (period && !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "period must look like 2026-04." }, { status: 400 });
  }

  try {
    const result = await runReminders({ period, dryRun, force });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reminder run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
