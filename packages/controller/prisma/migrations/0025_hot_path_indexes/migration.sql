-- Indexes for the queries that run all the time: the agent poll, the activity
-- bar and live logs (job events by job), the reaper, and the snapshot lists.
-- Postgres doesn't index foreign keys on its own.
CREATE INDEX "Snapshot_resourceId_startedAt_idx" ON "Snapshot"("resourceId", "startedAt");
CREATE INDEX "Snapshot_destinationId_status_idx" ON "Snapshot"("destinationId", "status");
CREATE INDEX "Snapshot_status_idx" ON "Snapshot"("status");
CREATE INDEX "Artifact_snapshotId_idx" ON "Artifact"("snapshotId");
CREATE INDEX "RestoreJob_snapshotId_idx" ON "RestoreJob"("snapshotId");
CREATE INDEX "AgentJob_agentId_status_createdAt_idx" ON "AgentJob"("agentId", "status", "createdAt");
CREATE INDEX "AgentJob_status_createdAt_idx" ON "AgentJob"("status", "createdAt");
CREATE INDEX "AgentJob_snapshotId_idx" ON "AgentJob"("snapshotId");
CREATE INDEX "AgentJob_restoreId_idx" ON "AgentJob"("restoreId");
CREATE INDEX "JobEvent_jobId_ts_idx" ON "JobEvent"("jobId", "ts");
