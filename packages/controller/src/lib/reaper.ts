import { prisma } from "./prisma";
import { notifyBackupFailed } from "./notify";
import { AGENT_ONLINE_MS } from "./agent-status";

export interface ReaperOptions {
  /** Mark an agent offline after this long without a heartbeat. */
  offlineMs?: number;
  /** Fallback hard cap for a running job whose type isn't in CAP_BY_TYPE. */
  stuckMs?: number;
}

/**
 * Absolute ceilings per job type — a backstop for a job that hangs while its
 * agent keeps heartbeating. Generous for data-moving jobs (a large volume or
 * restic repo can legitimately run for hours) and short for cheap ones, so the
 * reaper never truncates a healthy long-running backup/restore.
 */
const CAP_BY_TYPE: Record<string, number> = {
  backup: 6 * 3600_000,
  restore: 6 * 3600_000,
  mirror: 6 * 3600_000,
  "restore-drill": 6 * 3600_000,
  "verify-destination": 2 * 3600_000,
  prune: 60 * 60_000,
};

export type StuckReason = "agent went offline mid-job" | "job exceeded its time limit";

/**
 * Pure decision: why (if at all) a running job counts as stuck. A job is stuck
 * when its agent has gone offline, or it has run past a generous per-type cap.
 * Returns null for a healthy job (including a long one on a live agent).
 */
export function stuckReason(
  job: { type: string; claimedAt: Date | null; agent: { status: string; lastSeenAt: Date | null } | null },
  now: Date,
  offlineMs: number,
  fallbackCapMs: number,
): StuckReason | null {
  const agentDead =
    !job.agent ||
    job.agent.status === "offline" ||
    (job.agent.lastSeenAt != null && job.agent.lastSeenAt.getTime() < now.getTime() - offlineMs);
  if (agentDead) return "agent went offline mid-job";
  const cap = CAP_BY_TYPE[job.type] ?? fallbackCapMs;
  if (job.claimedAt != null && job.claimedAt.getTime() < now.getTime() - cap) return "job exceeded its time limit";
  return null;
}

/**
 * Housekeeping: mark silent agents offline and fail jobs/snapshots that are
 * genuinely stuck. A running job is stuck when its agent has gone offline
 * (the real "agent died mid-job" signal) OR it has exceeded a generous
 * per-type hard cap. Progress is NOT judged by elapsed time alone, so a large
 * backup on a live agent is left to finish. Idempotent; safe to run often.
 */
export async function reaper(now = new Date(), opts: ReaperOptions = {}): Promise<{ offline: number; stuck: number }> {
  const offlineMs = opts.offlineMs ?? AGENT_ONLINE_MS;
  const fallbackCapMs = opts.stuckMs ?? 2 * 3600_000;

  const offline = await prisma.agent.updateMany({
    where: { status: "online", lastSeenAt: { lt: new Date(now.getTime() - offlineMs) } },
    data: { status: "offline" },
  });

  // Re-read with the freshly-updated agent status so an agent we just marked
  // offline immediately releases its running jobs.
  const running = await prisma.agentJob.findMany({
    where: { status: "running" },
    select: {
      id: true,
      type: true,
      snapshotId: true,
      restoreId: true,
      claimedAt: true,
      agent: { select: { status: true, lastSeenAt: true } },
    },
  });

  let stuck = 0;
  for (const j of running) {
    const reason = stuckReason(j, now, offlineMs, fallbackCapMs);
    if (!reason) continue;

    stuck++;
    await prisma.agentJob.update({
      where: { id: j.id },
      // Drop the credentials the payload carried for the agent (see lib/scrub).
      data: { status: "failed", error: reason, finishedAt: now, payload: { scrubbed: true, type: j.type } },
    });
    if (j.snapshotId) {
      const upd = await prisma.snapshot.updateMany({
        where: { id: j.snapshotId, status: "running" },
        data: { status: "failed", error: reason, finishedAt: now },
      });
      if (upd.count > 0) await notifyBackupFailed(j.snapshotId).catch(() => undefined);
    }
    if (j.restoreId) {
      await prisma.restoreJob.updateMany({
        where: { id: j.restoreId, status: "running" },
        data: { status: "failed", error: reason, finishedAt: now },
      });
    }
    if (j.type === "restore-drill") {
      await prisma.restoreDrill.updateMany({
        where: { agentJobId: j.id, status: "running" },
        data: { status: "error", error: reason, finishedAt: now },
      });
    }
  }

  return { offline: offline.count, stuck };
}
