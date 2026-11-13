-- Environment variables captured by backups, stored once per distinct content.
CREATE TABLE "EnvBlob" (
    "id" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "envEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnvBlob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnvBlob_digest_key" ON "EnvBlob"("digest");
ALTER TABLE "Snapshot" ADD COLUMN "envBlobId" TEXT;
CREATE INDEX "Snapshot_envBlobId_idx" ON "Snapshot"("envBlobId");
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_envBlobId_fkey" FOREIGN KEY ("envBlobId") REFERENCES "EnvBlob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
