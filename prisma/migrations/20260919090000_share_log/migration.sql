-- A record of every view mailed out of the application.
--
-- The Share menu can now attach the filtered workbook to a message and send it
-- to a colleague. That is the first thing in this product that moves the plan's
-- figures outside it, and the question an audit asks afterwards is always the
-- same one: who sent what, to whom, and when. `reminder_log` already keeps that
-- record for the mail this application sends on its own initiative; this keeps
-- it for the mail people send deliberately.
--
-- The recipient is an `app_user`, not an address. Sending is offered only to
-- people who already have accounts, because the product is invite-only and a
-- free-text address field would end that quietly. The foreign key is what makes
-- the rule structural rather than a check somebody can forget.
--
-- `params` is the querystring the view was taken from - filters, period, target
-- version - so what was sent can be reconstructed rather than guessed at.
--
-- Creates only. Nothing existing is touched, so this applies to a populated
-- database with no effect on anything already stored.

-- CreateTable
CREATE TABLE "share_log" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "attached" BOOLEAN NOT NULL DEFAULT false,
    "attachment_bytes" INTEGER,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "share_log_sender_id_sent_at_idx" ON "share_log"("sender_id", "sent_at");

-- AddForeignKey
ALTER TABLE "share_log" ADD CONSTRAINT "share_log_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_log" ADD CONSTRAINT "share_log_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
