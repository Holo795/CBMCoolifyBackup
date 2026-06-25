import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { cronMatches } from "./cron";
import { enqueueBackup, enqueueVerifyDestination } from "./jobs";
import { applyRetention } from "./retention";
import { reaper } from "./reaper";
import { syncInstance } from "./discovery";
import { getTimezone } from "./settings";

/** Daily reconciliation: ask agents to confirm every destination's files are
 * still present, flagging any backup that vanished. */
async function reconcileAllDestinations(): Promise<void> {
  const dests = await prisma.destination.findMany({ select: { id: true, name: true } });
  for (const d of dests) {
    await enqueueVerifyDestination(d.id).catch((e) =>
      console.error(`[scheduler] reconcile ${d.name} failed:`, (e as Error).message),
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

const globalForSched = globalThis as unknown as { cbmSchedulerStarted?: boolean };

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
        console.error(`[scheduler] enqueue failed for ${r.name}:`, (e as Error).message);
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

  const schedule = () => {
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(async () => {
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
      schedule();
    }, msToNextMinute);
  };
  schedule();
  console.log("[scheduler] started");
}
