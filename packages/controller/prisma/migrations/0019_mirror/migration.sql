-- Mirror: a destination can copy every backup to a second destination, and a
-- mirror snapshot links back to its source so retention prunes both together.
ALTER TABLE "Destination" ADD COLUMN "mirrorToId" TEXT;
ALTER TABLE "Destination"
  ADD CONSTRAINT "Destination_mirrorToId_fkey"
  FOREIGN KEY ("mirrorToId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Snapshot" ADD COLUMN "mirrorOfId" TEXT;
ALTER TABLE "Snapshot"
  ADD CONSTRAINT "Snapshot_mirrorOfId_fkey"
  FOREIGN KEY ("mirrorOfId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Snapshot_mirrorOfId_idx" ON "Snapshot"("mirrorOfId");
