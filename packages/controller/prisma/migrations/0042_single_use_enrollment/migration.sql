-- Install tokens revealed from now on enroll one agent within 24 hours; the
-- current ones (false) stay reusable until a new command is revealed.
ALTER TABLE "CoolifyInstance" ADD COLUMN "enrollTokenSingleUse" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CoolifyInstance" ADD COLUMN "enrollTokenExpiresAt" TIMESTAMP(3);
