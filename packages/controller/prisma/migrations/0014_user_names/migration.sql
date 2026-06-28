-- First/last name on the user (the existing `name` stays as the "First Last"
-- display name, kept in sync from these).
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
