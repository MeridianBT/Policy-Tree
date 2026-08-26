-- "CORP" becomes "ALL".
--
-- The unit means "this measure belongs to every business unit rather than one
-- product line" - engagement, group revenue, safety - and ALL says that more
-- plainly than CORP, which reads as a head-office department.
--
-- The primary key moves with it so the readable id keeps matching the code.
-- Safe because control_item's foreign key is ON UPDATE CASCADE, so any measure
-- already filed under it follows automatically rather than being orphaned.
UPDATE "business_unit"
SET "id" = 'bu_all', "code" = 'ALL', "name" = 'All business units'
WHERE "code" = 'CORP';
