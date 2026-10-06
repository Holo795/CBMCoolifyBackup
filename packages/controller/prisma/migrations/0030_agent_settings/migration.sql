-- Agent settings managed from CBM: defaults for all agents, per-agent
-- overrides, and what each agent reports (env-locked keys, values in effect).
ALTER TABLE "Agent" ADD COLUMN "settings" JSONB;
ALTER TABLE "Agent" ADD COLUMN "settingsLocked" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Agent" ADD COLUMN "settingsInEffect" JSONB;
ALTER TABLE "Setting" ADD COLUMN "agentDefaults" JSONB;
