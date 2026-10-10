-- A job's time limit scaled to the data it moves.
ALTER TABLE "AgentJob" ADD COLUMN "timeLimitMs" INTEGER;
-- The agent that reads a remote destination (test restores, integrity checks, mirrors).
ALTER TABLE "Destination" ADD COLUMN "readAgentId" TEXT;
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_readAgentId_fkey" FOREIGN KEY ("readAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
