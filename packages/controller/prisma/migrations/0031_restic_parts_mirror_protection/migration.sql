-- restic engine: the extra restic snapshots of volumes restic read in place.
ALTER TABLE "Snapshot" ADD COLUMN "resticPartIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
-- Mirror copies are flagged for good, so they stay mirror copies once their
-- source is deleted (a mirror can now keep its own retention).
ALTER TABLE "Snapshot" ADD COLUMN "isMirror" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Snapshot" SET "isMirror" = true WHERE "mirrorOfId" IS NOT NULL;
-- Deletion protection: protected destinations, mirror retention, S3 check.
ALTER TABLE "Destination" ADD COLUMN "protected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Destination" ADD COLUMN "mirrorRetention" TEXT NOT NULL DEFAULT 'source';
ALTER TABLE "Destination" ADD COLUMN "mirrorKeepDaily" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Destination" ADD COLUMN "mirrorKeepWeekly" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Destination" ADD COLUMN "mirrorKeepMonthly" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "Destination" ADD COLUMN "protectionStatus" TEXT;
ALTER TABLE "Destination" ADD COLUMN "protectionDetail" TEXT;
ALTER TABLE "Destination" ADD COLUMN "protectionCheckedAt" TIMESTAMP(3);
