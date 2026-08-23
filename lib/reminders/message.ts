/**
 * What the reminder actually says.
 *
 * Kept pure and separate from sending so the wording can be read, tested and
 * changed without a mail server anywhere near it.
 *
 * The tone is a colleague's, not a system's: it says what is missing, how
 * many, and gives one link that lands on the screen where the numbers are
 * keyed. No dashboards, no scores, no "URGENT". People who get chased rudely
 * once start filtering the sender.
 */

import { monthLabel, parsePeriodKey, type PeriodKey } from "@/lib/domain/period";
import type { Recipient } from "./recipients";

export interface ReminderMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** "April 2026" - the month named the way a person would say it. */
export function periodTitle(period: PeriodKey): string {
  const { year } = parsePeriodKey(period);
  return `${monthLabel(period)} ${year}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** First name if we can find one - the greeting reads better and it is honest. */
function greetingName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function buildReminderMessage(
  recipient: Recipient,
  context: { period: PeriodKey; kiCode: string; appUrl: string },
): ReminderMessage {
  const when = periodTitle(context.period);
  const count = recipient.items.length;
  const noun = count === 1 ? "figure" : "figures";
  const entriesUrl = `${context.appUrl.replace(/\/$/, "")}/my-entries`;

  const subject = `${when}: ${count} ${noun} still to key — ${context.kiCode}`;

  const lines = recipient.items.map(
    (item) => `  - ${item.name} (${item.dicCode}) — ${item.objective}`,
  );

  const text = [
    `Hello ${greetingName(recipient.name)},`,
    ``,
    `${count} ${noun} for ${when} ${count === 1 ? "has" : "have"} not been keyed yet:`,
    ``,
    ...lines,
    ``,
    `You can key them here: ${entriesUrl}`,
    ``,
    `If one of these is not yours any more, ask an admin to reassign it.`,
  ].join("\n");

  const rows = recipient.items
    .map(
      (item) => `
        <tr>
          <td style="padding:6px 12px 6px 0;border-bottom:1px solid #dfdeda;">
            ${escapeHtml(item.name)}
            <div style="color:#8a887e;font-size:12px;">${escapeHtml(item.objective)}</div>
          </td>
          <td style="padding:6px 0;border-bottom:1px solid #dfdeda;color:#57564f;font-size:12px;white-space:nowrap;vertical-align:top;">
            ${escapeHtml(item.dicCode)}
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f7f6;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#141413;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #b5b3ac;padding:24px;">
    <h1 style="margin:0 0 4px;font-size:16px;font-weight:600;">${escapeHtml(when)} — ${count} ${noun} still to key</h1>
    <p style="margin:0 0 16px;font-size:13px;color:#57564f;">${escapeHtml(context.kiCode)}</p>

    <p style="margin:0 0 12px;font-size:13px;">Hello ${escapeHtml(greetingName(recipient.name))},</p>
    <p style="margin:0 0 16px;font-size:13px;">
      ${count === 1 ? "This measure has" : "These measures have"} no actual recorded for ${escapeHtml(when)}:
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:13px;">${rows}</table>

    <p style="margin:20px 0 0;">
      <a href="${escapeHtml(entriesUrl)}"
         style="display:inline-block;background:#141413;color:#ffffff;text-decoration:none;padding:9px 14px;font-size:13px;">
        Key these figures
      </a>
    </p>

    <p style="margin:20px 0 0;font-size:12px;color:#8a887e;">
      If one of these is not yours any more, ask an admin to reassign it.
    </p>
  </div>
</body></html>`;

  return { to: recipient.email, subject, text, html };
}
