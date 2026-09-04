-- Somewhere to write down why a measure means what it means, and why its
-- target is the number it is.
--
-- Both get argued about, and until now the plan kept no trace of either. A
-- Control Item carries `measured_as` - a 120-character label like "Units sold"
-- - which names the measurement method without defining it: whether that is
-- retail or wholesale, invoiced or delivered, net of cancellations or not, has
-- only ever lived in a meeting nobody minuted. And `entry_audit` records that a
-- figure changed, by whom and when, with no column to say why.
--
-- The table is append-only, like `entry_audit` and for the same reason: a
-- record of reasoning that can be quietly rewritten is worth nothing in the
-- argument it exists to settle. Nothing updates a row here. A revised
-- definition is a new row and the old one stays readable beneath it; a mistake
-- is withdrawn, visibly and by name, rather than deleted.
--
-- Two kinds in one table rather than two tables. A DEFINITION belongs to the
-- measure and carries no version; a RATIONALE belongs to one set of targets and
-- names the version it explains, so the log reads as the history of how the
-- number moved. The gap analysis and countermeasure text listed under
-- "Deliberately not built" is a third kind of the same thing, and when it
-- arrives it should be a value in this enum rather than a third table.
--
-- Creates only. Nothing existing is touched, so this applies to a populated
-- database with no effect on anything already stored.

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('DEFINITION', 'RATIONALE');

-- CreateTable
CREATE TABLE "control_item_note" (
    "id" TEXT NOT NULL,
    "control_item_id" TEXT NOT NULL,
    "kind" "NoteKind" NOT NULL,
    "body" TEXT NOT NULL,
    "plan_version_id" TEXT,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retracted_at" TIMESTAMP(3),
    "retracted_by" TEXT,

    CONSTRAINT "control_item_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "control_item_note_control_item_id_kind_created_at_idx" ON "control_item_note"("control_item_id", "kind", "created_at");

-- AddForeignKey
ALTER TABLE "control_item_note" ADD CONSTRAINT "control_item_note_control_item_id_fkey" FOREIGN KEY ("control_item_id") REFERENCES "control_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_item_note" ADD CONSTRAINT "control_item_note_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_item_note" ADD CONSTRAINT "control_item_note_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_item_note" ADD CONSTRAINT "control_item_note_retracted_by_fkey" FOREIGN KEY ("retracted_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
