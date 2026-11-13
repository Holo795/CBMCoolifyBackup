-- Retention rules now apply each on its own (lib/gfs): the newest of each of
-- the last N weeks / months, this one included. The chained rules before
-- reached one period further for a daily schedule: one more week and month
-- keeps at least the same history.
ALTER TABLE "BackupPolicy" ADD COLUMN "retentionLast" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BackupPolicy" ADD COLUMN "retentionHourly" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BackupPolicy" ADD COLUMN "retentionYearly" INTEGER NOT NULL DEFAULT 0;
UPDATE "BackupPolicy" SET "retentionWeekly" = "retentionWeekly" + 1 WHERE "retentionWeekly" > 0;
UPDATE "BackupPolicy" SET "retentionMonthly" = "retentionMonthly" + 1 WHERE "retentionMonthly" > 0;
UPDATE "Destination" SET "mirrorKeepWeekly" = "mirrorKeepWeekly" + 1 WHERE "mirrorKeepWeekly" > 0;
UPDATE "Destination" SET "mirrorKeepMonthly" = "mirrorKeepMonthly" + 1 WHERE "mirrorKeepMonthly" > 0;
-- Pinned snapshots are kept until unpinned.
ALTER TABLE "Snapshot" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Snapshot" ADD COLUMN "pinNote" TEXT;
