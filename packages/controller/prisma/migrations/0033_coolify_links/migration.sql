-- Coolify ids of a resource's project and environment, for a link to it in
-- Coolify's UI (filled by the next sync).
ALTER TABLE "Resource" ADD COLUMN "projectUuid" TEXT;
ALTER TABLE "Resource" ADD COLUMN "environmentUuid" TEXT;
