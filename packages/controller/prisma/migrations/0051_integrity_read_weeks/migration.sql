-- restic integrity checks read all data in this many weeks, a slice a day.
ALTER TABLE "Destination" ADD COLUMN "integrityReadWeeks" INTEGER NOT NULL DEFAULT 4;
