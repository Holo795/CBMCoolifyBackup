-- A skipped backup captured nothing, but kept the capture mode guessed when it
-- was queued ("frozen", "live"…), which the UI then showed. Data-only fix.
UPDATE "Snapshot" SET "captureMode" = 'none' WHERE "status" = 'skipped' AND "captureMode" <> 'none';
