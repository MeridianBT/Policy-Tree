-- The business unit dimension.
--
-- Hand-written because the column is required and existing rows need a value
-- before the constraint can go on. The order matters: create the table, seed
-- it, add the column nullable, backfill, then tighten to NOT NULL.
--
-- Fixed ids rather than generated ones. This is a small reference table whose
-- rows are seeded and referred to by code, and a readable id makes the
-- backfill below - and any later data fix - something a person can check.

CREATE TABLE "business_unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "business_unit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_unit_code_key" ON "business_unit"("code");

INSERT INTO "business_unit" ("id", "code", "name", "sort_order") VALUES
    ('bu_auto', 'AUTO', 'Automobiles',    0),
    ('bu_mc',   'MC',   'Motorcycles',    1),
    ('bu_pp',   'PP',   'Power Products', 2),
    -- Group-wide measures - engagement, group revenue, safety - belong to no
    -- product line. Without this they would have to be mis-filed under one of
    -- the three, and the number would then read as that unit's when it is not.
    ('bu_corp', 'CORP', 'Corporate',      3);

ALTER TABLE "control_item" ADD COLUMN "business_unit_id" TEXT;

-- Every measure that exists today predates the distinction and belongs to the
-- automobile business, which is the only one the plan has covered so far.
UPDATE "control_item" SET "business_unit_id" = 'bu_auto' WHERE "business_unit_id" IS NULL;

ALTER TABLE "control_item" ALTER COLUMN "business_unit_id" SET NOT NULL;

CREATE INDEX "control_item_business_unit_id_idx" ON "control_item"("business_unit_id");

ALTER TABLE "control_item"
    ADD CONSTRAINT "control_item_business_unit_id_fkey"
    FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
