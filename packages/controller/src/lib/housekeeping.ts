import { prisma } from "./prisma";

/** How long finished agent jobs (and their event logs) are kept. */
export const JOB_HISTORY_DAYS = 90;

/**
 * Daily cleanup of finished agent jobs older than JOB_HISTORY_DAYS (their
 * events cascade). Agent jobs and their per-line events were never deleted, so
 * the tables grew forever and slowed the polls that read them. Queued and
 * running jobs are never touched. Deletes in batches to keep transactions small.
 */
export async function cleanupJobHistory(now: Date, batch = 2000): Promise<number> {
  const cutoff = new Date(now.getTime() - JOB_HISTORY_DAYS * 86_400_000);
  let total = 0;
  for (;;) {
    const old = await prisma.agentJob.findMany({
      where: { status: { notIn: ["queued", "running"] }, createdAt: { lt: cutoff } },
      select: { id: true },
      take: batch,
    });
    if (old.length === 0) break;
    const { count } = await prisma.agentJob.deleteMany({ where: { id: { in: old.map((j) => j.id) } } });
    total += count;
    if (old.length < batch) break;
  }
  if (total > 0) console.log(`[housekeeping] removed ${total} finished job(s) older than ${JOB_HISTORY_DAYS} days`);
  return total;
}

/** How long the event lines of a job that succeeded are kept (the job itself:
 * JOB_HISTORY_DAYS). A failed job keeps its lines as long as it's kept. */
export const SUCCEEDED_EVENTS_DAYS = 30;

/** Daily: drop the log lines of succeeded jobs past SUCCEEDED_EVENTS_DAYS, and
 * the environment blobs no snapshot points at anymore. */
export async function trimHistory(now: Date): Promise<{ events: number; envBlobs: number }> {
  const cutoff = new Date(now.getTime() - SUCCEEDED_EVENTS_DAYS * 86_400_000);
  const { count: events } = await prisma.jobEvent.deleteMany({ where: { ts: { lt: cutoff }, job: { status: "succeeded" } } });
  const { removeUnusedEnvBlobs } = await import("./env-blobs");
  const envBlobs = await removeUnusedEnvBlobs();
  if (events || envBlobs) console.log(`[housekeeping] removed ${events} log line(s) of succeeded jobs and ${envBlobs} unused env blob(s)`);
  return { events, envBlobs };
}
