-- A succeeded snapshot can carry warnings (a database that could not be dumped...).
ALTER TABLE "Snapshot" ADD COLUMN "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[];
