-- Four roles in place of three.
--
-- Hand-written rather than generated: Prisma's own diff for an enum change
-- drops and recreates the type, which would discard every existing role
-- assignment. RENAME VALUE preserves the rows that already carry it, so a
-- user who was ADMIN is a SUPER_ADMIN afterwards with no data migration.
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';

-- Added after the rename so the new value cannot collide with the old name.
ALTER TYPE "UserRole" ADD VALUE 'EXECUTIVE' AFTER 'SUPER_ADMIN';
