import { prisma } from "./prisma";
import { logFailure } from "./log";
import { previousFireWithin } from "./cron";
import { effectivePolicy } from "./schedule";
import { getTimezone } from "./settings";
import { notifyOverdue, notifyStale } from "./notify";

/** Grace after a scheduled fire before a missing run is considered overdue
 * (covers a controller restart and the agent's poll latency). */
const GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Detect scheduled backups that never ran. For each enabled resource with an
 * effective schedule, find the most recent time it should have fired; if NO
 * snapshot was even attempted for that fire (and we're past the grace window),
 * it was missed - alert once (debounced via Resource.lastOverdueAlertAt).
 *
 * This is distinct from a failed backup (which has its own alert) and from a
 * backup that vanished from the destination (reconciliation): here, nothing ran
 * at all - e.g. the controller was down at the cron minute.
 */
/**
 * Pure: is a scheduled time a backup that should have run? Not when it came
 * before the resource existed, before it was included in scheduled backups
 * (or its own schedule set or removed), or before the schedule that applies to
 * it was created or last changed.
 */
export function dueBeforeExpected(
  due: Date,
  r: { createdAt: Date; scheduledSince: Date | null },
  policy: { createdAt: Date; updatedAt: Date },
): boolean {
  const since = Math.max(r.createdAt.getTime(), r.scheduledSince?.getTime() ?? 0, policy.createdAt.getTime(), policy.updatedAt.getTime());
  return due.getTime() < since;
}

/**
 * Pure: has the resource a successful backup since the scheduled run before
 * the last one? A run that was never expected (before it was included, or
 * before the schedule changed) never makes it stale.
 */
export function isFresh(
  lastSuccessAt: Date | null,
  runBefore: Date | null,
  r: { createdAt: Date; scheduledSince: Date | null },
  policy: { createdAt: Date; updatedAt: Date },
): boolean {
  if (!runBefore || dueBeforeExpected(runBefore, r, policy)) return true;
  return !!lastSuccessAt && lastSuccessAt.getTime() >= runBefore.getTime();
}

export async function checkOverdue(now = new Date()): Promise<{ overdue: number; stale: number }> {
  const tz = await getTimezone();
  const resources = await prisma.resource.findMany({
    where: { backupEnabled: true, status: { not: "deleted" } },
    include: { instance: { select: { name: true } } },
  });

  const prevCache = new Map<string, Date | null>();
  const alerts: { id: string; name: string; instance: string; due: Date }[] = [];
  const staleToAlert: string[] = [];

  const stale: { id: string; name: string; instance: string; lastSuccessAt: Date | null; fresh: boolean }[] = [];
  const freshAgain: string[] = [];
  const prevOf = (cron: string, at: Date) => {
    const key = `${cron}@${at.getTime()}`;
    let p = prevCache.get(key);
    if (p === undefined) {
      p = previousFireWithin(cron, at, tz);
      prevCache.set(key, p);
    }
    return p;
  };

  for (const r of resources) {
    const { policy } = await effectivePolicy(r.id);
    if (!policy) continue; // no schedule -> a backup isn't expected

    const prev = prevOf(policy.cron, now);
    if (!prev) continue; // schedule hasn't fired within the scan window
    if (now.getTime() < prev.getTime() + GRACE_MS) continue; // still within grace
    if (dueBeforeExpected(prev, r, policy)) continue; // not expected at that time

    // Freshness: two scheduled runs in a row without a successful backup (a
    // run that failed, or "skipped" every night, still counted as a run for
    // the overdue check below). Mirror copies don't count.
    const before = prevOf(policy.cron, new Date(prev.getTime() - 60_000));
    const fresh = isFresh(r.lastSuccessAt, before, r, policy);
    if (!fresh) {
      stale.push({ id: r.id, name: r.name, instance: r.instance.name, lastSuccessAt: r.lastSuccessAt, fresh: !r.staleSince });
      // Reminded once per scheduled run while it lasts.
      if (!r.lastStaleAlertAt || r.lastStaleAlertAt < prev) staleToAlert.push(r.id);
    } else if (r.staleSince) freshAgain.push(r.id);

    // Was anything at all attempted for this fire?
    const attempted = await prisma.snapshot.findFirst({
      where: { resourceId: r.id, startedAt: { gte: prev } },
      select: { id: true },
    });
    if (attempted) continue;

    // Missed. Debounce: only alert once per fire.
    if (r.lastOverdueAlertAt && r.lastOverdueAlertAt >= prev) continue;
    alerts.push({ id: r.id, name: r.name, instance: r.instance.name, due: prev });
  }

  if (alerts.length) {
    await notifyOverdue(alerts.map((a) => ({ name: a.name, instance: a.instance, due: a.due }))).catch(logFailure("alert"));
    await prisma.resource.updateMany({ where: { id: { in: alerts.map((a) => a.id) } }, data: { lastOverdueAlertAt: now } });
  }
  const newlyStale = stale.filter((x) => x.fresh).map((x) => x.id);
  if (newlyStale.length) await prisma.resource.updateMany({ where: { id: { in: newlyStale } }, data: { staleSince: now } });
  if (freshAgain.length) await prisma.resource.updateMany({ where: { id: { in: freshAgain } }, data: { staleSince: null } });
  if (staleToAlert.length) {
    const items = stale.filter((x) => staleToAlert.includes(x.id));
    await notifyStale(items.map((x) => ({ name: x.name, instance: x.instance, lastSuccessAt: x.lastSuccessAt }))).catch(logFailure("alert"));
    await prisma.resource.updateMany({ where: { id: { in: staleToAlert } }, data: { lastStaleAlertAt: now } });
  }
  return { overdue: alerts.length, stale: stale.length };
}
