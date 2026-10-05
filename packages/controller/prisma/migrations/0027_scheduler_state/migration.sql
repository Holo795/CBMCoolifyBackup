-- The scheduler's last evaluated minute survives restarts (missed minutes are
-- replayed, bounded, instead of skipped).
CREATE TABLE "SchedulerState" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "lastMinute" INTEGER NOT NULL,

    CONSTRAINT "SchedulerState_pkey" PRIMARY KEY ("id")
);
