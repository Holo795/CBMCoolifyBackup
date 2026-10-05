import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { cronMatches } from "./cron";
import { enqueueBackup, enqueueVerifyDestination } from "./jobs";
import { applyRetention } from "./retention";
import { reaper } from "./reaper";
import { checkOverdue } from "./overdue";
import { maybeSelfBackup, checkSelfBackupOverdue } from "./self-backup";
import { syncInstance } from "./discovery";
import { getTimezone } from "./settings";

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
 * work; the other's loop stays dormant. Best-effort — if the lock can't be
 * evaluated (no DB URL / error), we assume leadership so a single-instance
 * deploy is never left without a scheduler.
 */
const SCHEDULER_ADVISORY_LOCK_KEY = 4242000001;
let isSchedulerLeader = true;

async function acquireSchedulerLeadership(): Promise<void> {
  if (!process.env.DATABASE_URL) return; // assume leader (dev / no DB)
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [
      SCHEDULER_ADVISORY_LOCK_KEY,
    ]);
    if (res.rows[0]?.ok === true) {
      // Hold the connection (and the lock) for the process lifetime.
      globalForSched.cbmSchedulerLockClient = client;
      isSchedulerLeader = true;
    } else {
      await client.end().catch(() => undefined);
      isSchedulerLeader = false;
      console.warn("[scheduler] another replica holds the scheduler lock - this one stays dormant");
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

/** Start the minute-aligned scheduler loop (idempotent). */
export function startScheduler(): void {
  if (globalForSched.cbmSchedulerStarted) return;
  globalForSched.cbmSchedulerStarted = true;

  // Try to become the scheduler leader before the first tick (best-effort).
  void acquireSchedulerLeadership();

  const schedule = () => {
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(async () => {
      // Only the leader replica runs scheduled work (see the advisory lock above).
      if (!isSchedulerLeader) {
        schedule();
        return;
      }
      try {
        await tick(new Date());
      } catch (e) {
        console.error("[scheduler] tick error", e);
      }
      try {
        await reaper(new Date());
      } catch (e) {
        console.error("[scheduler] reaper error", e);
      }
      try {
        // Refresh discovery every 5 minutes (status + prune/mark removed).
        if (new Date().getMinutes() % 5 === 0) await syncAllInstances();
      } catch (e) {
        console.error("[scheduler] auto-sync error", e);
      }
      try {
        // Reconcile destinations once a day (detect backups deleted at rest).
        const n = new Date();
        if (n.getHours() === 3 && n.getMinutes() === 30) await reconcileAllDestinations();
      } catch (e) {
        console.error("[scheduler] reconcile error", e);
      }
      try {
        // Weekly deep integrity check (Sunday 04:00) for opted-in destinations.
        const n = new Date();
        if (n.getDay() === 0 && n.getHours() === 4 && n.getMinutes() === 0) await integrityCheckAllDestinations();
      } catch (e) {
        console.error("[scheduler] integrity check error", e);
      }
      try {
        // Detect scheduled backups that never ran (hourly).
        if (new Date().getMinutes() === 7) await checkOverdue(new Date());
      } catch (e) {
        console.error("[scheduler] overdue check error", e);
      }
      try {
        // Self-backup of the controller metadata DB: change-driven + throttled,
        // with a daily safety re-run (see lib/self-backup.ts).
        await maybeSelfBackup(new Date());
      } catch (e) {
        console.error("[scheduler] self-backup error", e);
      }
      try {
        // Alert if the self-backup hasn't succeeded in over a day (hourly).
        if (new Date().getMinutes() === 11) await checkSelfBackupOverdue(new Date());
      } catch (e) {
        console.error("[scheduler] self-backup overdue check error", e);
      }
      schedule();
    }, msToNextMinute);
  };
  schedule();
  console.log("[scheduler] started");
}
