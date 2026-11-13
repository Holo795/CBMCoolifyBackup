-- After a recovery-file import, schedules, the self-backup and alerts wait for an admin.
ALTER TABLE "Setting" ADD COLUMN "recoveryHoldSince" TIMESTAMP(3);
ALTER TABLE "Setting" ADD COLUMN "recoveryFileDestHash" TEXT;
ALTER TABLE "Setting" ADD COLUMN "recoveryFileFormat" INTEGER;
