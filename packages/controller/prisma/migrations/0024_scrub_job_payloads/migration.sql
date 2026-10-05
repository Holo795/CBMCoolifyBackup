-- Finished agent jobs no longer keep their payload: it carried decrypted
-- destination credentials, AES keys, restic passwords and DB credentials for the
-- agent, and was copied into every metadata self-backup. Keep only the type.
UPDATE "AgentJob"
SET "payload" = jsonb_build_object('scrubbed', true, 'type', "type")
WHERE "status" NOT IN ('queued', 'running');
