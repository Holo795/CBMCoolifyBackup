-- A job's full payload (credentials, keys) is stored encrypted; "payload"
-- keeps only what the controller reads.
ALTER TABLE "AgentJob" ADD COLUMN "payloadEnc" TEXT;
