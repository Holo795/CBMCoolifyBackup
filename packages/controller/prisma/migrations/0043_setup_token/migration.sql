-- The first account needs a setup token (shown in the logs or set by SETUP_TOKEN).
CREATE TABLE "SetupState" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "tokenHash" TEXT,
    "email" TEXT,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "SetupState_pkey" PRIMARY KEY ("id")
);
