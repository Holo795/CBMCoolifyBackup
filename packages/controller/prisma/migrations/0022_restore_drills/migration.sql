-- Restore drills: a snapshot restored into a throwaway agent-side sandbox (never
-- Coolify) to prove it's restorable. History per snapshot + an opt-in weekly run.
CREATE TABLE "RestoreDrill" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "agentJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "checks" JSONB,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RestoreDrill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestoreDrill_agentJobId_key" ON "RestoreDrill"("agentJobId");
CREATE INDEX "RestoreDrill_snapshotId_createdAt_idx" ON "RestoreDrill"("snapshotId", "createdAt");

ALTER TABLE "RestoreDrill"
  ADD CONSTRAINT "RestoreDrill_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Setting" ADD COLUMN "drillsEnabled" BOOLEAN NOT NULL DEFAULT false;
