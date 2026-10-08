import { randomUUID } from "node:crypto";
import { CONFIG_ONLY_CAPTURE } from "@cbm/shared";
import { prisma } from "./prisma";
import { cronMatches } from "./cron";
import { enqueueBackup, enqueueVerifyDestination, enqueueDrill } from "./jobs";
import { applyRetention, applyAllMirrorRetention } from "./retention";
import { checkAllProtection } from "./protection-check";
import { reaper } from "./reaper";
import { checkOverdue } from "./overdue";
import { maybeSelfBackup, checkSelfBackupOverdue } from "./self-backup";
import { syncInstance } from "./discovery";
import { getTimezone } from "./settings";
import { cleanupJobHistory } from "./housekeeping";
import { retryStuckDeletions } from "./snapshot-removal";
import { autoUpdateAgents } from "./agent-update";

/**
 * Record the outcome of a scheduled verify so "no agent could reach this
 * destination" is visible in the UI instead of only a log line. A successful
 * queue clears a stale no-agent flag (the real ok/failed status is written by
 * the job result).
 */
async function recordVerifyOutcome(destId: string, res: { queued: number; reason?: string }): Promise<void> {
  if (res.reason === "no-agent") {
    await prisma.destination
      .update({ where: { id: destId }, data: { lastIntegrityStatus: "no-agent", lastIntegrityAt: new Date() } })
      .catch(() => undefined);
  } else if (res.queued > 0) {
    await prisma.destination
      .updateMany({ where: { id: destId, lastIntegrityStatus: "no-agent" }, data: { lastIntegrityStatus: null } })
      .catch(() => undefined);
  }
}

/** Daily reconciliation: ask agents to confirm every destination's files are
 * still present, flagging any backup that vanished. */
async function reconcileAllDestinations(): Promise<void> {
  const dests = await prisma.destination.findMany({ select: { id: true, name: true } });
  for (const d of dests) {
    await enqueueVerifyDestination(d.id)
      .then((res) => recordVerifyOutcome(d.id, res))
      .catch((e) => console.error(`[scheduler] reconcile ${d.name} failed:`, (e as Error).message));
  }
}

/** Weekly deep integrity check for destinations that opted in: re-read the
 * stored content (restic `check` / tar re-checksum) to catch silent corruption. */
async function integrityCheckAllDestinations(): Promise<void> {
  const dests = await prisma.destination.findMany({
    where: { integrityCheckEnabled: true },
    select: { id: true, name: true },
  });
  for (const d of dests) {
    await enqueueVerifyDestination(d.id, { deep: true })
      .then((res) => recordVerifyOutcome(d.id, res))
      .catch((e) => console.error(`[scheduler] integrity check ${d.name} failed:`, (e as Error).message));
  }
}

/**
 * Weekly restore drills (opt-in in Settings): restore each backup-enabled
 * resource's latest successful snapshot into an agent-side sandbox. A snapshot
 * with a definitive result (passed/failed) or a drill in flight is skipped - its
 * outcome won't change - while one whose drill errored is retried.
 */
async function drillAllResources(): Promise<void> {
  const setting = await prisma.setting.findUnique({ where: { id: "global" }, select: { drillsEnabled: true } });
  if (!setting?.drillsEnabled) return;
  const resources = await prisma.resource.findMany({ where: { backupEnabled: true }, select: { id: true, name: true } });
  for (const r of resources) {
    const latest = await prisma.snapshot.findFirst({
      // A configuration-only snapshot has nothing to test.
      where: { resourceId: r.id, status: "succeeded", isMirror: false, captureMode: { not: CONFIG_ONLY_CAPTURE } },
      orderBy: { startedAt: "desc" },
      select: { id: true, drills: { where: { status: { in: ["passed", "failed", "running"] } }, select: { id: true }, take: 1 } },
    });
    if (!latest || latest.drills.length > 0) continue;
    await enqueueDrill(latest.id, "scheduled").catch((e) =>
      console.error(`[scheduler] restore drill for ${r.name} not queued:`, (e as Error).message),
    );
  }
}

/** Re-discover every instance so statuses refresh and removed resources are
 * pruned/marked without a manual Sync. */
async function syncAllInstances(): Promise<void> {
  const instances = await prisma.coolifyInstance.findMany({ select: { id: true } });
  for (const i of instances) {
    await syncInstance(i.id).catch((e) => console.error(`[scheduler] sync ${i.id} failed:`, (e as Error).message));
  }
}

const globalForSched = globalThis as unknown as {
  cbmSchedulerStarted?: boolean;
  cbmSchedulerLockClient?: import("pg").Client;
};

/**
 * The scheduler is a single in-process loop; running two controller replicas
 * would double-fire crons. Deploy exactly ONE controller replica.
 *
 * As a backstop against an accidental second replica, we hold a Postgres
 * session-level advisory lock: only the replica that grabs it runs scheduled
 * work; the other's loop stays dormant. Leadership is re-checked every minute:
 * a lock connection that dropped (database restart, network blip) means the
 * lock is gone and must be won again, and a dormant replica keeps trying, so
 * it takes over when the leader dies. Best-effort - if the lock can't be
 * evaluated (no DB URL / error), we act as leader for that minute so a
 * single-instance deploy is never left without a scheduler.
 */
const SCHEDULER_ADVISORY_LOCK_KEY = 4242000001;
let isSchedulerLeader = true;

/** Forget a lock connection that died: its lock is gone with it. */
function dropLockClient(): void {
  const c = globalForSched.cbmSchedulerLockClient;
  globalForSched.cbmSchedulerLockClient = undefined;
  isSchedulerLeader = false;
  c?.end().catch(() => undefined);
}

/** Are we (still) the scheduler leader? Re-validates a held lock, else tries to win it. */
async function ensureSchedulerLeadership(): Promise<boolean> {
  const held = globalForSched.cbmSchedulerLockClient;
  if (held) {
    try {
      await held.query("SELECT 1");
      return true;
    } catch {
      console.warn("[scheduler] lost the scheduler lock connection - competing for it again");
      dropLockClient();
    }
  }
  await acquireSchedulerLeadership();
  return isSchedulerLeader;
}

async function acquireSchedulerLeadership(): Promise<void> {
  if (!process.env.DATABASE_URL) return; // assume leader (dev / no DB)
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    // A dropped connection (database restart…) releases the lock: stop leading
    // instead of crashing on the unhandled error.
    client.on("error", () => {
      if (globalForSched.cbmSchedulerLockClient === client) dropLockClient();
    });
    await client.connect();
    const res = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [
      SCHEDULER_ADVISORY_LOCK_KEY,
    ]);
    if (res.rows[0]?.ok === true) {
      // Hold the connection (and the lock) while it lives.
      globalForSched.cbmSchedulerLockClient = client;
      if (!isSchedulerLeader) console.log("[scheduler] won the scheduler lock - this replica runs scheduled work");
      isSchedulerLeader = true;
    } else {
      await client.end().catch(() => undefined);
      if (isSchedulerLeader) console.warn("[scheduler] another replica holds the scheduler lock - this one stays dormant");
      isSchedulerLeader = false;
    }
  } catch (e) {
    // Never leave a single-instance deploy without a scheduler over a lock hiccup.
    console.warn("[scheduler] advisory lock unavailable, assuming leadership:", (e as Error).message);
    isSchedulerLeader = true;
  }
}

/** Evaluate all enabled policies and enqueue backups for those due now. */
export async function tick(now = new Date()): Promise<number> {
  const policies = await prisma.backupPolicy.findMany({ where: { enabled: true } });
  const tz = await getTimezone();
  let triggered = 0;
  for (const p of policies) {
    let due = false;
    try {
      due = cronMatches(p.cron, now, tz);
    } catch {
      continue;
    }
    if (!due) continue;

    // backupEnabled is the single gate: a resource is in scheduled backups only
    // when it's enabled.
    let resources;
    if (p.resourceId) {
      // Resource override.
      resources = await prisma.resource.findMany({ where: { id: p.resourceId, backupEnabled: true } });
    } else if (p.instanceId && p.serverUuid) {
      // Per-server schedule: enabled resources on this server WITHOUT their own
      // override policy.
      const overrides = await prisma.backupPolicy.findMany({
        where: { resourceId: { not: null }, resource: { instanceId: p.instanceId }, enabled: true },
        select: { resourceId: true },
      });
      const skip = new Set(overrides.map((o) => o.resourceId));
      const all = await prisma.resource.findMany({
        where: { instanceId: p.instanceId, serverUuid: p.serverUuid, backupEnabled: true },
      });
      resources = all.filter((r) => !skip.has(r.id));
    } else if (p.instanceId) {
      // Whole instance: enabled resources WITHOUT their own override AND not
      // covered by a more-specific per-server policy.
      const overrides = await prisma.backupPolicy.findMany({
        where: { resourceId: { not: null }, resource: { instanceId: p.instanceId }, enabled: true },
        select: { resourceId: true },
      });
      const skip = new Set(overrides.map((o) => o.resourceId));
      const serverScoped = await prisma.backupPolicy.findMany({
        where: { instanceId: p.instanceId, serverUuid: { not: null }, enabled: true },
        select: { serverUuid: true },
      });
      const coveredServers = new Set(serverScoped.map((s) => s.serverUuid));
      const all = await prisma.resource.findMany({ where: { instanceId: p.instanceId, backupEnabled: true } });
      resources = all.filter((r) => !skip.has(r.id) && !(r.serverUuid && coveredServers.has(r.serverUuid)));
    } else {
      // A policy with neither a resource nor an instance is not used anymore.
      continue;
    }

    const runId = randomUUID();
    for (const r of resources) {
      try {
        await enqueueBackup(r.id, p.id, runId);
        triggered++;
      } catch (e) {
        // The run could not even be queued (e.g. no agent on the resource's
        // server). Record a visible failed snapshot + alert instead of only
        // logging, so a skipped resource doesn't silently look healthy.
        const message = (e as Error).message;
        console.error(`[scheduler] enqueue failed for ${r.name}:`, message);
        try {
          const snap = await prisma.snapshot.create({
            data: {
              resourceId: r.id,
              policyId: p.id,
              destinationId: p.destinationId,
              mode: p.mode,
              captureMode: "none",
              status: "failed",
              destinationDir: "",
              runId,
              error: message,
              finishedAt: new Date(),
            },
          });
          const { notifyBackupFailed } = await import("./notify");
          await notifyBackupFailed(snap.id).catch(() => undefined);
        } catch (e2) {
          console.error(`[scheduler] could not record failed snapshot for ${r.name}:`, (e2 as Error).message);
        }
      }
    }
    // Retention runs after each policy fire (cheap, idempotent).
    await applyRetention(p.id).catch(() => undefined);
  }
  return triggered;
}

/**
 * Housekeeping tasks as crons, evaluated in the configured timezone (they used
 * to compare the container's clock, i.e. UTC). Heavy ones run detached so they
 * never delay backup scheduling, with a guard so a slow run can't overlap itself.
 */
const TASKS: Array<{ name: string; cron: string; run: () => Promise<unknown>; detached: boolean }> = [
  { name: "auto-sync", cron: "*/5 * * * *", run: () => syncAllInstances(), detached: true },
  { name: "reconcile", cron: "30 3 * * *", run: () => reconcileAllDestinations(), detached: true },
  { name: "integrity check", cron: "0 4 * * 0", run: () => integrityCheckAllDestinations(), detached: true },
  { name: "restore drills", cron: "0 5 * * 6", run: () => drillAllResources(), detached: true },
  { name: "overdue check", cron: "7 * * * *", run: () => checkOverdue(new Date()), detached: true },
  { name: "self-backup overdue check", cron: "11 * * * *", run: () => checkSelfBackupOverdue(new Date()), detached: true },
  { name: "job history cleanup", cron: "45 2 * * *", run: () => cleanupJobHistory(new Date()), detached: true },
  { name: "deletion retry", cron: "20 */6 * * *", run: () => retryStuckDeletions(new Date()), detached: true },
  { name: "mirror retention", cron: "40 3 * * *", run: () => applyAllMirrorRetention(), detached: true },
  { name: "protection check", cron: "30 4 * * 0", run: () => checkAllProtection(), detached: true },
  { name: "agent auto-update", cron: "*/10 * * * *", run: () => autoUpdateAgents(new Date()), detached: true },
];
const taskInFlight = new Set<string>();

function runTask(t: (typeof TASKS)[number]): Promise<void> | void {
  if (taskInFlight.has(t.name)) return; // the previous run is still going
  taskInFlight.add(t.name);
  const p = t
    .run()
    .then(() => undefined)
    .catch((e) => console.error(`[scheduler] ${t.name} error`, e))
    .finally(() => taskInFlight.delete(t.name));
  return t.detached ? undefined : p;
}

/** Longest gap re-evaluated after a slow tick (or a short pause of the process). */
const MAX_REPLAY_MINUTES = 15;

/**
 * Pure: which minutes (epoch minutes) to evaluate now, given the last evaluated
 * one. Every minute since the previous tick is evaluated once - a tick that ran
 * long no longer skips crons or the fixed daily/weekly tasks - bounded so a long
 * outage doesn't fire a burst of stale schedules.
 */
export function minutesToEvaluate(lastEvaluated: number | null, nowMs: number, max = MAX_REPLAY_MINUTES): number[] {
  const current = Math.floor(nowMs / 60_000);
  if (lastEvaluated === null || lastEvaluated >= current) return lastEvaluated === current ? [] : [current];
  const from = Math.max(lastEvaluated + 1, current - max + 1);
  const out: number[] = [];
  for (let m = from; m <= current; m++) out.push(m);
  return out;
}

/** Start the minute-aligned scheduler loop (idempotent). */
export function startScheduler(): void {
  if (globalForSched.cbmSchedulerStarted) return;
  globalForSched.cbmSchedulerStarted = true;

  // Try to become the scheduler leader before the first tick (best-effort).
  void acquireSchedulerLeadership();

  let lastEvaluated: number | null = null;
  let loaded = false;

  const loop = async () => {
    // Resume where the previous process stopped (persisted), so a restart
    // replays the minutes it missed rather than skipping their schedules.
    if (!loaded) {
      loaded = true;
      const saved = await prisma.schedulerState.findUnique({ where: { id: "global" } }).catch(() => null);
      if (saved) lastEvaluated = saved.lastMinute;
    }
    const minutes = minutesToEvaluate(lastEvaluated, Date.now());
    if (minutes.length) {
      lastEvaluated = minutes[minutes.length - 1];
      const lastMinute = lastEvaluated;
      await prisma.schedulerState
        .upsert({ where: { id: "global" }, create: { lastMinute }, update: { lastMinute } })
        .catch(() => undefined);
    }
    const tz = await getTimezone().catch(() => "UTC");
    for (const m of minutes) {
      const at = new Date(m * 60_000);
      try {
        await tick(at);
      } catch (e) {
        console.error("[scheduler] tick error", e);
      }
      for (const t of TASKS) {
        let due = false;
        try {
          due = cronMatches(t.cron, at, tz);
        } catch {
          due = false;
        }
        if (due) await runTask(t);
      }
    }
    try {
      await reaper(new Date());
    } catch (e) {
      console.error("[scheduler] reaper error", e);
    }
    try {
      // Self-backup of the controller metadata DB: change-driven + throttled,
      // with a daily safety re-run (see lib/self-backup.ts).
      await maybeSelfBackup(new Date());
    } catch (e) {
      console.error("[scheduler] self-backup error", e);
    }
  };

  const schedule = () => {
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(async () => {
      // Only the leader replica runs scheduled work (see the advisory lock above).
      if (await ensureSchedulerLeadership()) await loop().catch((e) => console.error("[scheduler] loop error", e));
      schedule();
    }, msToNextMinute);
  };
  schedule();
  console.log("[scheduler] started");
}
