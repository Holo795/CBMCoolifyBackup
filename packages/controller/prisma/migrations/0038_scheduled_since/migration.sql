-- Since when a resource is in scheduled backups: an earlier scheduled time isn't a missed backup.
ALTER TABLE "Resource" ADD COLUMN "scheduledSince" TIMESTAMP(3);
