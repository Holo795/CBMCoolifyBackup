-- Freshness: the newest successful backup of each resource, and since when
-- scheduled runs stopped producing one.
ALTER TABLE "Resource" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
ALTER TABLE "Resource" ADD COLUMN "staleSince" TIMESTAMP(3);
ALTER TABLE "Resource" ADD COLUMN "lastStaleAlertAt" TIMESTAMP(3);
UPDATE "Resource" r SET "lastSuccessAt" = (
  SELECT max(s."startedAt") FROM "Snapshot" s
  WHERE s."resourceId" = r.id AND s.status = 'succeeded' AND NOT s."isMirror"
);
