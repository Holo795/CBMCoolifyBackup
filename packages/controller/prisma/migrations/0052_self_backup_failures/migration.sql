-- Self-backup failures: retried every 10 minutes, alerted after an hour.
ALTER TABLE "SchedulerState" ADD COLUMN "selfBackupAttemptAt" TIMESTAMP(3);
ALTER TABLE "SchedulerState" ADD COLUMN "selfBackupFailingSince" TIMESTAMP(3);
ALTER TABLE "SchedulerState" ADD COLUMN "selfBackupAlertedAt" TIMESTAMP(3);
