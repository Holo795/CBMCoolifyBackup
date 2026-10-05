-- Containers an agent currently sees for a resource ([{ name, service? }]),
-- refreshed by heartbeats so per-container hooks can be set before the first
-- backup and follow redeploys (the compose service name is the stable target).
ALTER TABLE "Resource" ADD COLUMN "containers" JSONB;
