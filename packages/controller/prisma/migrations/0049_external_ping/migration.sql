-- An external check pinged while CBM runs (its silence alerts when CBM is down).
ALTER TABLE "Setting" ADD COLUMN "pingUrl" TEXT;
ALTER TABLE "SchedulerState" ADD COLUMN "lastPingAt" TIMESTAMP(3);
ALTER TABLE "SchedulerState" ADD COLUMN "lastPingStatus" TEXT;
