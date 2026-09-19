"use server";

/**
 * Sending a view of the plan to a colleague.
 *
 * This is the first thing in the application that moves the plan's figures out
 * of it, so three rules shape it and none of them is a detail.
 *
 * **The recipient already has an account.** They are chosen by id from the
 * people this deployment has invited, never typed as an address. The product
 * is invite-only; a free-text address field would end that quietly, and the
 * responsible-user picker holds exactly the same line for the same reason.
 *
 * **The file is the view.** The workbook comes from `workbookForView`, which is
 * what the Export button downloads - so what lands in the inbox is what was on
 * the screen, filters and target version and all, rather than a second
 * interpretation of the same request.
 *
 * **Every send is recorded.** `share_log` keeps who sent which view to whom.
 * The question after the fact is always that one, and a feature that carries
 * figures out of the building should not need an inbox search to answer it.
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { GraphMailer, graphConfigured, type MailAttachment } from "@/lib/reminders/mailer";
import { UnknownDivision, workbookFilename, workbookForView } from "@/lib/export/for-view";
import { ATTACHMENT_LIMIT_BYTES, buildShareMessage, shareUrl } from "./message";

export type ShareResult = { ok: true; message: string } | { ok: false; message: string };

const schema = z.object({
  recipientId: z.string().min(1, "Choose who to send this to."),
  /** The querystring the view was taken from. */
  params: z.string().max(4000),
  note: z.string().max(500).optional(),
  viewTitle: z.string().min(1).max(200),
  periodLabel: z.string().min(1).max(60),
  attach: z.boolean().default(true),
});

export interface ShareRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
  orgUnitCode: string | null;
}

/**
 * Who a view can be sent to: everybody with an account, except the sender.
 *
 * Not scoped by role or org unit. Anybody signed in can already read the sheet
 * and press Export, so a narrower list here would restrict who may *receive*
 * what the recipient could fetch themselves in two clicks - a rule that looks
 * like security and is only friction.
 */
export async function shareRecipients(): Promise<ShareRecipient[]> {
  const me = await requireSession();
  const users = await prisma.appUser.findMany({
    where: { isActive: true, id: { not: me.id } },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      orgUnit: { select: { code: true } },
    },
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    orgUnitCode: user.orgUnit?.code ?? null,
  }));
}

/** Whether mail can be sent at all from this deployment. */
export async function canSendMail(): Promise<boolean> {
  await requireSession();
  return graphConfigured();
}

export async function shareCurrentView(input: z.input<typeof schema>): Promise<ShareResult> {
  try {
    const sender = await requireSession();
    const { recipientId, params, note, viewTitle, periodLabel, attach } = schema.parse(input);

    const recipient = await prisma.appUser.findFirst({
      where: { id: recipientId, isActive: true },
      select: { id: true, name: true, email: true },
    });
    // Never created here, only found. An invitation is an administrator's act.
    if (!recipient) return { ok: false, message: "That person no longer has an account here." };

    if (!graphConfigured()) {
      return {
        ok: false,
        message:
          "Mail is not configured on this deployment, so nothing was sent. Use Export to Excel and attach it yourself.",
      };
    }

    const search = new URLSearchParams(params);
    let attachments: MailAttachment[] = [];
    let attachmentName: string | undefined;
    let attachmentSkipped: "TOO_LARGE" | undefined;

    if (attach) {
      const workbook = await workbookForView(search);
      const name = workbookFilename(workbook);
      if (workbook.buffer.byteLength > ATTACHMENT_LIMIT_BYTES) {
        // The link still goes, and the message says why it is on its own.
        attachmentSkipped = "TOO_LARGE";
      } else {
        attachmentName = name;
        attachments = [
          {
            filename: name,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            content: workbook.buffer,
          },
        ];
      }
    }

    const appUrl = process.env.APP_URL ?? "";
    const message = buildShareMessage({
      to: recipient.email,
      recipientName: recipient.name,
      senderName: sender.name,
      note,
      viewTitle,
      kiCode: search.get("ki") ?? "",
      periodLabel,
      viewUrl: shareUrl(appUrl, search),
      attachmentName,
      attachmentSkipped,
    });

    await new GraphMailer().send(message, attachments);

    await prisma.shareLog.create({
      data: {
        senderId: sender.id,
        recipientId: recipient.id,
        params,
        attached: attachments.length > 0,
        attachmentBytes: attachments[0]?.content.byteLength ?? null,
      },
    });

    return {
      ok: true,
      message: attachments.length
        ? `Sent to ${recipient.name} with ${attachmentName}.`
        : attachmentSkipped
          ? `Sent to ${recipient.name}. The workbook was too large to attach, so the link went on its own.`
          : `Sent to ${recipient.name}.`,
    };
  } catch (error) {
    if (error instanceof UnknownDivision) {
      return { ok: false, message: "That view names a division that no longer exists." };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "That is not a view I can send." };
    }
    /*
     * Graph's failures are the interesting ones and they are also the ones
     * that quote the request back. Say that sending failed and leave the
     * detail in the server log, where it is not being read by whoever the
     * screen belongs to.
     */
    console.error("share failed", error);
    return { ok: false, message: "Sending failed. Nothing was sent, and the error is in the log." };
  }
}
