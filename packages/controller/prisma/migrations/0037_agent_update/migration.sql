-- Agents report their version and image; CBM can update them (by hand or automatically).
ALTER TABLE "Agent" ADD COLUMN "version" TEXT;
ALTER TABLE "Agent" ADD COLUMN "image" TEXT;
ALTER TABLE "Agent" ADD COLUMN "selfUpdate" TEXT;
ALTER TABLE "Setting" ADD COLUMN "agentAutoUpdate" BOOLEAN NOT NULL DEFAULT false;
