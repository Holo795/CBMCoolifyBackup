-- restic: real (deduplicated) bytes stored, per repository and per resource,
-- measured by the daily reconciliation.
CREATE TABLE "RepoUsage" (
    "destinationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepoUsage_pkey" PRIMARY KEY ("destinationId","scope")
);

CREATE TABLE "ResourceUsage" (
    "resourceId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceUsage_pkey" PRIMARY KEY ("resourceId","destinationId")
);

CREATE INDEX "ResourceUsage_destinationId_idx" ON "ResourceUsage"("destinationId");

ALTER TABLE "RepoUsage" ADD CONSTRAINT "RepoUsage_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceUsage" ADD CONSTRAINT "ResourceUsage_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceUsage" ADD CONSTRAINT "ResourceUsage_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
