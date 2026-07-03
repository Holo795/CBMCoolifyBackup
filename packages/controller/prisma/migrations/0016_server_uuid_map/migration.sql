-- Restore-time server remap for multi-server TARGET instances:
-- { <source server uuid>: <target server uuid> }. Null/absent = auto.
ALTER TABLE "CoolifyInstance" ADD COLUMN "serverUuidMap" JSONB;
