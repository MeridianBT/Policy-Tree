/**
 * What a shared view says when it arrives.
 *
 * Pure and separate from sending, the same split `lib/reminders/message.ts`
 * makes and for the same reason: the wording is the part worth reading and
 * testing, and it should not need a mail server anywhere near it.
 *
 * The tone is a colleague forwarding something, because that is what it is.
 * The message names who sent it, what they sent, and the period it covers -
 * a spreadsheet of targets landing in an inbox with no period on it is the
 * one that gets read as the wrong quarter six weeks later.
 */

import type { ReminderMessage } from "@/lib/reminders/message";

/**
 * Graph carries an attachment inline in `sendMail` up to about 3 MB. Past
 * that it needs an upload session - a different call, a different failure
 * mode - which is not worth building for a spreadsheet that measures in the
 * hundreds of kilobytes. The link goes on its own instead, and the message
 * says so rather than arriving mysteriously bare.
 */
export const ATTACHMENT_LIMIT_BYTES = 3 * 1024 * 1024;

export interface ShareContext {
  to: string;
  recipientName: string;
  senderName: string;
  /** Whatever the sender typed. Optional, and empty is the common case. */
  note?: string;
  /** What the view is called, as the screen titles it. */
  viewTitle: string;
  kiCode: string;
  /** "full year", "Q2", "four quarters" - the period on screen. */
  periodLabel: string;
  /** A link that opens the same view, filters and all. */
  viewUrl: string;
  /** The workbook's name, when one is travelling with the message. */
  attachmentName?: string;
  /** Why no workbook is attached, when there is a reason worth stating. */
  attachmentSkipped?: "TOO_LARGE";
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

export function buildShareMessage(context: ShareContext): ReminderMessage {
  const scope = `${context.kiCode} · ${context.viewTitle} · ${context.periodLabel}`;
  const subject = `${context.senderName} shared ${context.viewTitle} (${context.kiCode})`;

  const attachmentLine = context.attachmentName
    ? `The workbook is attached as ${context.attachmentName}, filtered exactly as the screen was.`
    : context.attachmentSkipped === "TOO_LARGE"
      ? "The workbook was too large to attach, so the link is on its own - open it and use Export to Excel there."
      : "";

  const lines = [
    `Hello ${greetingName(context.recipientName)},`,
    "",
    `${context.senderName} has shared a view of the plan with you.`,
    "",
    scope,
    "",
    ...(context.note ? [context.note, ""] : []),
    ...(attachmentLine ? [attachmentLine, ""] : []),
    `Open the same view: ${context.viewUrl}`,
    "",
    "Hoshin Kanri",
  ];

  const html = `
    <p>Hello ${escapeHtml(greetingName(context.recipientName))},</p>
    <p>${escapeHtml(context.senderName)} has shared a view of the plan with you.</p>
    <p><strong>${escapeHtml(scope)}</strong></p>
    ${context.note ? `<p>${escapeHtml(context.note)}</p>` : ""}
    ${attachmentLine ? `<p>${escapeHtml(attachmentLine)}</p>` : ""}
    <p><a href="${escapeHtml(context.viewUrl)}">Open the same view</a></p>
    <p style="color:#6b7280">Hoshin Kanri</p>
  `.trim();

  return { to: context.to, subject, text: lines.join("\n"), html };
}

/**
 * The link that reopens the view.
 *
 * The querystring is the same one Export and the print routes travel on, so a
 * link, a workbook and a printed page taken from one screen all describe the
 * same thing.
 */
export function shareUrl(appUrl: string, params: URLSearchParams): string {
  const base = appUrl.replace(/\/$/, "");
  const query = params.toString();
  return query ? `${base}/sheet?${query}` : `${base}/sheet`;
}
