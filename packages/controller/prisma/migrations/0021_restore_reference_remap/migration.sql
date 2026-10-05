-- Restore → new reference rewiring: each clone records which source resource it
-- came from and where it landed, so a later "→ new" restore onto the same
-- instance can point its env references at the clones instead of the originals.
ALTER TABLE "RestoreJob" ADD COLUMN "sourceUuid" TEXT;
ALTER TABLE "RestoreJob" ADD COLUMN "targetUuid" TEXT;
ALTER TABLE "RestoreJob" ADD COLUMN "targetInstanceId" TEXT;
ALTER TABLE "RestoreJob" ADD COLUMN "remapped" JSONB;
CREATE INDEX "RestoreJob_targetInstanceId_idx" ON "RestoreJob"("targetInstanceId");
