-- The latest run of each schedule is read on every Instances page view.
CREATE INDEX "Snapshot_policyId_startedAt_idx" ON "Snapshot"("policyId", "startedAt");
