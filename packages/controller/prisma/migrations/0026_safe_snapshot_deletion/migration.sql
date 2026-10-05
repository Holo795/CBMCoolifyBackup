-- Safe snapshot deletion: a snapshot becomes "deleting" and its row is removed
-- only once an agent has deleted its files (retried otherwise). A mirror copy is
-- no longer cascade-deleted with its source: each row goes with its own files.
ALTER TABLE "Snapshot" ADD COLUMN "deleteRequestedAt" TIMESTAMP(3);
ALTER TABLE "Snapshot" DROP CONSTRAINT "Snapshot_mirrorOfId_fkey";
ALTER TABLE "Snapshot"
  ADD CONSTRAINT "Snapshot_mirrorOfId_fkey"
  FOREIGN KEY ("mirrorOfId") REFERENCES "Snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
