-- "ALL" becomes "SHARED".
--
-- The four units are mutually exclusive tags, and selecting none of them is
-- what gives the consolidated company view. A unit named ALL sat too close to
-- that meaning: it reads as "everything" when it actually means "this measure
-- is shared across the units rather than belonging to one". SHARED says which
-- of the two it is.
--
-- The primary key moves with the code so the readable id keeps matching it.
-- Safe because control_item's foreign key is ON UPDATE CASCADE, so a measure
-- already filed under it follows rather than being orphaned.
UPDATE "business_unit"
SET "id" = 'bu_shared', "code" = 'SHARED', "name" = 'Shared across units'
WHERE "code" = 'ALL';
