-- Deep integrity check (opt-in, weekly): restic `check` / tar re-checksum to
-- catch silent corruption. Per-destination toggle + last-run status.
ALTER TABLE "Destination" ADD COLUMN "integrityCheckEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Destination" ADD COLUMN "lastIntegrityAt" TIMESTAMP(3);
ALTER TABLE "Destination" ADD COLUMN "lastIntegrityStatus" TEXT;
