-- SMTP configuration + soft email-verification toggle on the global Setting row.
-- user/password are stored encrypted (encryptSecret); env vars override them.
ALTER TABLE "Setting" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "Setting" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "Setting" ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN "smtpUser" TEXT;
ALTER TABLE "Setting" ADD COLUMN "smtpPasswordEnc" TEXT;
ALTER TABLE "Setting" ADD COLUMN "smtpFrom" TEXT;
ALTER TABLE "Setting" ADD COLUMN "smtpFromName" TEXT;
ALTER TABLE "Setting" ADD COLUMN "smtpLastVerifiedOk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN "requireEmailVerification" BOOLEAN NOT NULL DEFAULT false;
