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
  // Waits for the agent's other jobs (up to 6 h), then a few minutes.
  "update-agent": 7 * 3600_000,
};

/** How long an agent may stay silent while it updates itself. */
const UPDATE_DOWNTIME_MS = 10 * 60_000;

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
  // An agent being updated is down for a while by design: its updater reports
  // the outcome (or puts the previous agent back) within a few minutes.
  if (job.type === "update-agent" && job.agent?.lastSeenAt != null && job.agent.lastSeenAt.getTime() > now.getTime() - UPDATE_DOWNTIME_MS)
    return null;
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
export async function reaper(now = new Date(), opts: ReaperOptions = {}): Promise<{ offline: number; stuck: number; expired: number }> {
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
    if (await failJob(j, "running", reason, now)) stuck++;
  }

  // Jobs no agent picked up in time. Without this a job queued to an agent that
  // never came back stayed queued forever - and ran whenever it did, e.g. an
  // in-place restore days after it was asked for.
  const queued = await prisma.agentJob.findMany({
    where: { status: "queued", createdAt: { lt: new Date(now.getTime() - MIN_QUEUE_TTL_MS) } },
    select: { id: true, type: true, snapshotId: true, restoreId: true, createdAt: true },
  });
  let expired = 0;
  for (const j of queued) {
    const reason = queueExpiredReason(j, now);
    if (reason && (await failJob(j, "queued", reason, now))) expired++;
  }

  return { offline: offline.count, stuck, expired };
}

/**
 * How long a job may wait in the queue before it's cancelled. Short for an
 * in-place restore (running it much later would surprise anyone); a prune may
 * wait for its agent (the files only exist on that host).
 */
const QUEUE_TTL_BY_TYPE: Record<string, number> = {
  restore: 30 * 60_000,
  backup: 2 * 3600_000,
  mirror: 12 * 3600_000,
  "verify-destination": 12 * 3600_000,
  "restore-drill": 12 * 3600_000,
  prune: 7 * 24 * 3600_000,
  // An update asked for while the agent was away isn't run hours later.
  "update-agent": 60 * 60_000,
};
const DEFAULT_QUEUE_TTL_MS = 12 * 3600_000;
const MIN_QUEUE_TTL_MS = Math.min(...Object.values(QUEUE_TTL_BY_TYPE));

/** Pure decision: has a queued job waited past its type's limit? */
export function queueExpiredReason(job: { type: string; createdAt: Date }, now: Date): string | null {
  const ttl = QUEUE_TTL_BY_TYPE[job.type] ?? DEFAULT_QUEUE_TTL_MS;
  if (now.getTime() - job.createdAt.getTime() < ttl) return null;
  return `no agent picked this job up within ${Math.round(ttl / 60_000)} min - cancelled`;
}

/** A job claimed this recently may not be in the agent's list yet (the claim
 * and the heartbeat race). */
const LOST_JOB_GRACE_MS = 2 * 60_000;

/** Pure: which of an agent's running jobs it no longer reports as its own. */
export function lostJobIds(
  running: { id: string; claimedAt: Date | null }[],
  activeIds: string[],
  now: Date,
  graceMs = LOST_JOB_GRACE_MS,
): string[] {
  const active = new Set(activeIds);
  return running
    .filter((j) => !active.has(j.id) && j.claimedAt != null && j.claimedAt.getTime() < now.getTime() - graceMs)
    .map((j) => j.id);
}

/**
 * Fail the running jobs an agent says it isn't running any more (it restarted
 * mid-job, e.g. for an upgrade). Without this they stayed "running" until the
 * per-type cap - hours during which the resource refused new backups.
 */
export async function releaseLostJobs(agentId: string, activeIds: string[], now = new Date()): Promise<number> {
  const running = await prisma.agentJob.findMany({
    where: { agentId, status: "running" },
    select: { id: true, type: true, snapshotId: true, restoreId: true, claimedAt: true },
  });
  const lost = new Set(lostJobIds(running, activeIds, now));
  let n = 0;
  for (const j of running) {
    if (lost.has(j.id) && (await failJob(j, "running", "the agent restarted or lost this job", now))) n++;
  }
  return n;
}

/**
 * Fail a job that is still in `from` (the condition makes it race-free against
 * a concurrent claim or result), and everything that waits on it. Also drops
 * the credentials its payload carried (see lib/scrub). Returns false when the
 * job had already moved on.
 */
async function failJob(
  j: { id: string; type: string; snapshotId: string | null; restoreId: string | null },
  from: "queued" | "running",
  reason: string,
  now: Date,
): Promise<boolean> {
  const upd = await prisma.agentJob.updateMany({
    where: { id: j.id, status: from },
    data: { status: "failed", error: reason, finishedAt: now, payload: { scrubbed: true, type: j.type } },
  });
  if (upd.count === 0) return false;
  if (j.snapshotId) {
    const snap = await prisma.snapshot.updateMany({
      where: { id: j.snapshotId, status: "running" },
      data: { status: "failed", error: reason, finishedAt: now },
    });
    if (snap.count > 0) await notifyBackupFailed(j.snapshotId).catch(() => undefined);
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
  return true;
}
