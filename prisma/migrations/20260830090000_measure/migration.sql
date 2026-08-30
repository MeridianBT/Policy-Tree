-- A Measure is named once and may be held to several Control Items.
--
-- Until now one row was all three things at once: the measure, the control
-- item, and the target series. A measure judged against three targets had to
-- be typed as three rows repeating one name, and renaming it meant editing
-- every one of them.
--
-- The split is deliberately uneven. The Measure takes only the name, its place
-- under the Objective and its order; everything that could differ between two
-- Control Items of the same measure - the department in charge, the business
-- unit, the person who keys it, the unit and direction - stays on the Control
-- Item. That is what keeps the filters, the permission checks, the formula
-- engine, the entries, the audit trail and the reminders operating on exactly
-- the row they always did.
--
-- Every existing Control Item becomes its own Measure of one, so nothing that
-- exists today reads differently afterwards.

CREATE TABLE "measure" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "measure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "measure_node_id_idx" ON "measure"("node_id");

ALTER TABLE "measure"
    ADD CONSTRAINT "measure_node_id_fkey"
    FOREIGN KEY ("node_id") REFERENCES "node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One measure per existing control item, carrying its name, its parent and its
-- position. The measure's id is the control item's own id: it is already
-- unique, and reusing it makes the backfill below exact rather than a join on
-- a name that two rows could share.
INSERT INTO "measure" ("id", "node_id", "name", "sort_order")
SELECT "id", "node_id", "name", "sort_order" FROM "control_item";

ALTER TABLE "control_item" ADD COLUMN "measure_id" TEXT;

UPDATE "control_item" SET "measure_id" = "id";

ALTER TABLE "control_item" ALTER COLUMN "measure_id" SET NOT NULL;

CREATE INDEX "control_item_measure_id_idx" ON "control_item"("measure_id");

ALTER TABLE "control_item"
    ADD CONSTRAINT "control_item_measure_id_fkey"
    FOREIGN KEY ("measure_id") REFERENCES "measure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The name and the parent now live on the measure. sort_order stays on the
-- control item but changes meaning: it orders a measure's own control items
-- among themselves, and every measure starts with exactly one.
DROP INDEX IF EXISTS "control_item_node_id_idx";
ALTER TABLE "control_item" DROP CONSTRAINT IF EXISTS "control_item_node_id_fkey";
ALTER TABLE "control_item" DROP COLUMN "node_id";
ALTER TABLE "control_item" DROP COLUMN "name";
UPDATE "control_item" SET "sort_order" = 0;
