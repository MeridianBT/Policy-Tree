-- Put back the rung the tree is missing.
--
-- A Level 4 department branch ladders from a Level 3, and only from a Level 3:
-- a division picks up a deployment the company has already written down. Plans
-- created before that rule was enforced have Level 4 rows hanging straight off
-- a Level 2, which leaves them illegal in two visible ways. The "L4+" button is
-- offered on Level 3 rows only, so a department cannot add a sibling branch
-- where it already has one; and sibling ordering is by sort_order alone now
-- that no parent is expected to carry children of two levels, so a Level 2
-- holding both would interleave them and a new branch would appear to land
-- somewhere down the list.
--
-- This inserts the missing Level 3 under each affected Level 2 and re-parents
-- that Level 2's Level 4 children onto it. Nothing is deleted: every node,
-- Control Item, figure and owner survives, and the branch keeps its place in
-- the reading order because the new row takes the lowest sort_order of the
-- children it adopts.
--
-- The new Level 3 repeats its Level 2's statement. That is deliberate. The
-- company's own wording for a deployment it never actually wrote down is not
-- recoverable from the database, and inventing one here would put words into
-- the plan that nobody in the business chose. Repeating the statement says
-- exactly what happened - the objective was carried down a level unchanged -
-- and it is a rename away from whatever the team would rather it said.
--
-- A no-op on any plan that is already legal, which is every plan built by the
-- current seeders.
WITH orphaned AS (
  SELECT DISTINCT parent.id AS level_2_id
  FROM node AS branch
  JOIN node AS parent ON parent.id = branch.parent_id
  WHERE branch.level = 4 AND parent.level = 2
),
deployment AS (
  INSERT INTO node (id, ki_id, parent_id, level, kind, statement, org_unit_id, sort_order)
  SELECT
    gen_random_uuid()::text,
    parent.ki_id,
    parent.id,
    3,
    'OBJECTIVE'::"NodeKind",
    parent.statement,
    -- A Level 3 is the company's, owned by nobody in particular; the org unit
    -- lives on the Level 4 branches that ladder off it.
    NULL,
    (SELECT min(child.sort_order) FROM node AS child
      WHERE child.parent_id = parent.id AND child.level = 4)
  FROM node AS parent
  JOIN orphaned ON orphaned.level_2_id = parent.id
  RETURNING id, parent_id
)
UPDATE node AS branch
SET parent_id = deployment.id
FROM deployment
WHERE branch.parent_id = deployment.parent_id
  AND branch.level = 4;
