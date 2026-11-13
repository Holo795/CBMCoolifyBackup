-- How many complete discoveries in a row missed a resource: it is taken as
-- removed from Coolify only after several, never on a single listing.
ALTER TABLE "Resource" ADD COLUMN "missingSyncs" INTEGER NOT NULL DEFAULT 0;
