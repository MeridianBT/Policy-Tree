/**
 * Sending mail through Microsoft Graph.
 *
 * A reminder run has no signed-in user - it is a scheduler calling in at
 * 6am - so this uses the client-credentials flow and sends as a fixed
 * mailbox named by REMINDER_FROM, rather than as anybody in particular.
 *
 * Worth knowing before asking IT for the permission: the application
 * permission `Mail.Send` lets an app send as *any* mailbox in the tenant.
 * Most security teams will, rightly, scope it with an application access
 * policy so it can only send as the one shared mailbox this uses. Expect
 * that question and have the mailbox picked before the conversation.
 *
 * The transport is deliberately behind the `Mailer` interface: the sending
 * half is the part that cannot be unit-tested, so everything that decides
 * *what* to send stays on the other side of it.
 */

import type { ReminderMessage } from "./message";

/**
 * A file travelling with a message.
 *
 * Graph will carry an attachment inline in `sendMail` up to about 3 MB; past
 * that it needs an upload session, which is a different shape of call. The
 * caller checks the size and decides what to do about it - this interface
 * stays the simple one, because the thing that actually gets sent from this
 * application is a spreadsheet of a few hundred kilobytes.
 */
export interface MailAttachment {
  filename: string;
  contentType: string;
  content: ArrayBuffer;
}

export interface Mailer {
  send(message: ReminderMessage, attachments?: readonly MailAttachment[]): Promise<void>;
}

/** Collects instead of sending. Used by dry runs and by tests. */
export class RecordingMailer implements Mailer {
  readonly sent: ReminderMessage[] = [];
  readonly attached: Array<readonly MailAttachment[]> = [];
  async send(message: ReminderMessage, attachments: readonly MailAttachment[] = []): Promise<void> {
    this.sent.push(message);
    this.attached.push(attachments);
  }
}

export function graphConfigured(): boolean {
  return Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
      process.env.GRAPH_CLIENT_SECRET &&
      process.env.GRAPH_TENANT_ID &&
      process.env.REMINDER_FROM,
  );
}

async function accessToken(): Promise<string> {
  const tenant = process.env.GRAPH_TENANT_ID!;
  const body = new URLSearchParams({
    client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
    client_secret: process.env.GRAPH_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    // Never echo the body verbatim: a token endpoint failure can quote the
    // request back, secret included, into whatever collects these logs.
    throw new Error(`Graph token request failed (${response.status}).`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Graph token response carried no access_token.");
  return json.access_token;
}

export class GraphMailer implements Mailer {
  private token: Promise<string> | null = null;

  /** One token for the whole run; they last an hour and a run takes seconds. */
  private getToken(): Promise<string> {
    this.token ??= accessToken();
    return this.token;
  }

  async send(message: ReminderMessage, attachments: readonly MailAttachment[] = []): Promise<void> {
    const from = process.env.REMINDER_FROM!;
    const token = await this.getToken();

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: { contentType: "HTML", content: message.html },
            toRecipients: [{ emailAddress: { address: message.to } }],
            ...(attachments.length > 0 && {
              attachments: attachments.map((attachment) => ({
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: attachment.filename,
                contentType: attachment.contentType,
                contentBytes: Buffer.from(attachment.content).toString("base64"),
              })),
            }),
          },
          /*
           * A reminder is a notification and does not belong in the shared
           * mailbox's Sent Items - hundreds of copies nobody will read. A
           * message somebody sent on purpose, with a file attached, is
           * correspondence: it belongs in the record, and `share_log` keeping
           * its own row is not a reason for the mailbox to forget it.
           */
          saveToSentItems: attachments.length > 0,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Graph sendMail failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
  }
}
