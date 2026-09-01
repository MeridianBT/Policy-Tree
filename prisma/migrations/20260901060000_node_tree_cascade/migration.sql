-- Deleting a row takes the branch beneath it.
--
-- The self-relation on `node` carried no delete action, and an optional
-- relation in Prisma defaults to SET NULL rather than CASCADE. So deleting an
-- Objective did not remove the rows laddering off it - it set their parent_id
-- to NULL and left them behind. `deleteNode` says as much in a comment
-- ("Cascades handle descendants") and the confirmation prompt promises it
-- ("removes 7 rows beneath it"); the database was doing the opposite.
--
-- An orphan is worse than a leak. A row with no parent has no ancestor chain,
-- so `loadSheet` treats it as a root and prints it beside the Goals, at the top
-- of the company sheet, with no heading above it and nothing to say where it
-- came from.
--
-- Any rows already orphaned this way are adopted by nobody and cannot be
-- placed automatically - there is no record of where they hung. They are left
-- for an admin to delete or re-file from the structure builder, which is
-- honest: guessing a parent would be inventing plan structure.

ALTER TABLE "node" DROP CONSTRAINT "node_parent_id_fkey";

ALTER TABLE "node"
    ADD CONSTRAINT "node_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
