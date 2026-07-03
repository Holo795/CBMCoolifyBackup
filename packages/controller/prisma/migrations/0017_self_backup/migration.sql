-- Self-backup (disaster recovery): the controller pg_dumps its own metadata DB
-- to a destination as a single overwritten artefact; plus recovery-file
-- bookkeeping (generation + staleness fingerprints).
ALTER TABLE "Setting" ADD COLUMN "selfBackupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN "selfBackupDestinationId" TEXT;
ALTER TABLE "Setting" ADD COLUMN "selfBackupLastRunAt" TIMESTAMP(3);
ALTER TABLE "Setting" ADD COLUMN "selfBackupLastStatus" TEXT;
ALTER TABLE "Setting" ADD COLUMN "recoveryFileGeneration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Setting" ADD COLUMN "recoveryFileAt" TIMESTAMP(3);
ALTER TABLE "Setting" ADD COLUMN "recoveryFileDestId" TEXT;
ALTER TABLE "Setting" ADD COLUMN "recoveryFileKeyFp" TEXT;
