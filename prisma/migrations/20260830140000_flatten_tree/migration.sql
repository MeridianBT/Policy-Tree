-- The tree loses two label tiers: an Objective is now the measure.
--
-- Three text layers stood above every figure on the sheet - a Theme, an
-- Objective and a Measure - and only the third carried numbers. What a reviewer
-- reads is "New vehicle deliveries: 4,560 against 4,800", and they had to walk
-- past two headings to reach it. So Themes go, Measures become Objectives, and
-- an Objective carries its Control Items directly at Levels 2, 3 and 4 alike.
--
-- One rule replaces five: Goal, then Objectives all the way down.
--
-- What the migration does, in order:
--
--   1. Every Measure becomes an Objective node at the level its old Objective
--      sat at, keeping the measure's name as the statement and its order.
--   2. Control Items re-point from their Measure to that new node.
--   3. The old control_item -> measure -> node cascade is severed, before any
--      node is deleted. Doing this last instead cost every figure in the
--      database the first time this migration was run.
--   4. Level 3 and 4 branches re-parent onto the FIRST new Objective derived
--      from the old one that used to hold them. Deterministic rather than
--      clever: there is no principled way to choose among an old objective's
--      measures, and the first is the one the plan already listed first.
--   5. A Level 4 branch's org unit moves from its Theme down onto its
--      Objective, which is the row that now carries it.
--   6. Every Theme, and every Objective that has been superseded, is deleted.
--
-- Nothing is lost that carried a figure: entries, audit rows and formula edges
-- all hang off control_item, which survives with its id intact.

-- 1 & 2 -------------------------------------------------------------------
CREATE TEMP TABLE measure_node AS
SELECT
    m."id"          AS measure_id,
    m."node_id"     AS old_node_id,
    n."ki_id"       AS ki_id,
    n."level"       AS level,
    n."parent_id"   AS old_parent_id,
    n."org_unit_id" AS org_unit_id,
    m."name"        AS statement,
    m."sort_order"  AS sort_order,
    -- A new id per measure. cuid() is not available in SQL, so the measure's
    -- own id is reused: it is unique, and nothing outside this table refers to
    -- a measure once the column below is dropped.
    m."id"          AS new_node_id
FROM "measure" m
JOIN "node" n ON n."id" = m."node_id";

INSERT INTO "node" ("id", "ki_id", "parent_id", "level", "kind", "statement", "org_unit_id", "sort_order")
SELECT new_node_id, ki_id, old_parent_id, level, 'OBJECTIVE', statement, org_unit_id, sort_order
FROM measure_node;

ALTER TABLE "control_item" ADD COLUMN "node_id" TEXT;
UPDATE "control_item" ci
SET "node_id" = mn.new_node_id
FROM measure_node mn
WHERE mn.measure_id = ci."measure_id";


-- 3 ------------------------------------------------------------------------
-- Sever control_item -> measure -> node BEFORE deleting a single node.
-- control_item.measure_id cascades from measure, and measure.node_id cascades
-- from node, so deleting a superseded Objective while that chain is intact
-- takes its Control Items and every figure keyed against them.
ALTER TABLE "control_item" ALTER COLUMN "node_id" SET NOT NULL;
DROP INDEX IF EXISTS "control_item_measure_id_idx";
ALTER TABLE "control_item" DROP CONSTRAINT IF EXISTS "control_item_measure_id_fkey";
ALTER TABLE "control_item" DROP COLUMN "measure_id";
DROP TABLE "measure";

-- 4 ------------------------------------------------------------------------
-- The first new Objective under each old one, by the order the plan listed it.
CREATE TEMP TABLE first_child AS
SELECT DISTINCT ON (old_node_id) old_node_id, new_node_id
FROM measure_node
ORDER BY old_node_id, sort_order, new_node_id;

UPDATE "node" child
SET "parent_id" = fc.new_node_id
FROM first_child fc
WHERE child."parent_id" = fc.old_node_id
  AND child."id" <> fc.new_node_id
  AND child."id" NOT IN (SELECT new_node_id FROM measure_node);

-- 5 ------------------------------------------------------------------------
-- A Level 4 objective takes the org unit its Theme used to carry.
UPDATE "node" objective
SET "org_unit_id" = theme."org_unit_id"
FROM "node" theme
WHERE objective."parent_id" = theme."id"
  AND theme."kind" = 'THEME'
  AND objective."level" = 4;

-- A Level 4 branch hangs off the company Objective it ladders into, which is
-- the Theme's own parent now that the Theme is going.
UPDATE "node" objective
SET "parent_id" = theme."parent_id"
FROM "node" theme
WHERE objective."parent_id" = theme."id"
  AND theme."kind" = 'THEME';

-- Any new Objective still parented to a Theme (the Level 2 and 3 measures)
-- moves up to that Theme's own parent as well.
UPDATE "node" child
SET "parent_id" = theme."parent_id"
FROM "node" theme
WHERE child."parent_id" = theme."id"
  AND theme."kind" = 'THEME';

-- 6 ------------------------------------------------------------------------
-- The superseded Objectives, then the Themes. Children have been re-parented
-- above, so nothing is taken with them.
DELETE FROM "node"
WHERE "id" IN (SELECT DISTINCT old_node_id FROM measure_node);

DELETE FROM "node" WHERE "kind" = 'THEME';

-- The order among an Objective's own Control Items, which used to be the order
-- among a Measure's.
UPDATE "control_item" SET "sort_order" = 0 WHERE "sort_order" IS NULL;

-- ------------------------------------------------------------------- schema
-- The new foreign key goes on last, once every node that is going has gone.
CREATE INDEX "control_item_node_id_idx" ON "control_item"("node_id");
ALTER TABLE "control_item"
    ADD CONSTRAINT "control_item_node_id_fkey"
    FOREIGN KEY ("node_id") REFERENCES "node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NodeKind" RENAME TO "NodeKind_old";
CREATE TYPE "NodeKind" AS ENUM ('GOAL', 'OBJECTIVE');
ALTER TABLE "node" ALTER COLUMN "kind" TYPE "NodeKind" USING ("kind"::text::"NodeKind");
DROP TYPE "NodeKind_old";
