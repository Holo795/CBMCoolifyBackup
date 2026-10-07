-- Login an admin sets in CBM for the logical dumps of a resource's databases.
ALTER TABLE "Resource" ADD COLUMN "dumpUser" TEXT;
ALTER TABLE "Resource" ADD COLUMN "dumpPasswordEnc" TEXT;
