import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Start of the agent's message when restic waits for another job's lock. */
const LOCK_WAIT_PREFIX = "Waiting for the repository lock";

/**
 * Recent agent jobs for the activity bar: running + recently finished backups,
 * restores, mirrors and destination checks, newest first. Any signed-in user
 * can see the fleet's activity.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const select = {
    id: true,
    type: true,
    status: true,
    snapshotId: true,
    restoreId: true,
    error: true,
    createdAt: true,
    finishedAt: true,
    agent: { select: { hostname: true } },
    events: { orderBy: { ts: "desc" as const }, take: 1, select: { progress: true, message: true } },
  };
  const [jobs, runningAll] = await Promise.all([
    prisma.agentJob.findMany({ orderBy: { createdAt: "desc" }, take: 25, select }),
    // Every running job (a long one may be older than the 25 above): who may hold a lock.
    prisma.agentJob.findMany({ where: { status: "running" }, take: 200, select }),
  ]);

  // Resolve a human label per job: the resource name for backups/restores.
  const all = [...jobs, ...runningAll];
  const snapIds = [...new Set(all.map((j) => j.snapshotId).filter((x): x is string => !!x))];
  const restoreIds = [...new Set(all.map((j) => j.restoreId).filter((x): x is string => !!x))];
  const [snaps, restores] = await Promise.all([
    snapIds.length
      ? prisma.snapshot.findMany({
          where: { id: { in: snapIds } },
          select: { id: true, destinationId: true, resource: { select: { name: true } } },
        })
      : [],
    restoreIds.length
      ? prisma.restoreJob.findMany({
          where: { id: { in: restoreIds } },
          select: { id: true, snapshot: { select: { destinationId: true, resource: { select: { name: true } } } } },
        })
      : [],
  ]);
  const snapName = new Map(snaps.map((s) => [s.id, s.resource.name]));
  const restoreName = new Map(restores.map((r) => [r.id, r.snapshot.resource.name]));

  // A running job whose agent said it waits for the repository lock: name the
  // other running jobs on the same destination (one of them holds it).
  const running = runningAll;
  const others = running.filter((j) => !j.snapshotId && !j.restoreId);
  const payloads = others.length
    ? await prisma.agentJob.findMany({ where: { id: { in: others.map((j) => j.id) } }, select: { id: true, payload: true } })
    : [];
  const payloadDest = new Map(
    payloads.map((p) => {
      const v = p.payload as { destinationId?: string; targetDestinationId?: string } | null;
      return [p.id, v?.destinationId ?? v?.targetDestinationId];
    }),
  );
  const snapDest = new Map(snaps.map((s) => [s.id, s.destinationId]));
  const restoreDest = new Map(restores.map((r) => [r.id, r.snapshot.destinationId]));
  const destOf = (j: (typeof jobs)[number]) =>
    j.snapshotId ? snapDest.get(j.snapshotId) : j.restoreId ? restoreDest.get(j.restoreId) : payloadDest.get(j.id);
  const labelOf = (j: (typeof jobs)[number]) =>
    (j.snapshotId
      ? snapName.get(j.snapshotId)
      : j.restoreId
        ? restoreName.get(j.restoreId)
        : j.type === "update-agent"
          ? j.agent.hostname
          : null) ?? null;
  const waits = (j: (typeof jobs)[number]) => j.status === "running" && !!j.events[0]?.message?.startsWith(LOCK_WAIT_PREFIX);
  const lockHolders = (j: (typeof jobs)[number]) => {
    if (!waits(j)) return undefined;
    const dest = destOf(j);
    const there = running.filter((o) => o.id !== j.id && dest && destOf(o) === dest);
    // Those working there hold it; others waiting too don't.
    const held = there.some((o) => !waits(o)) ? there.filter((o) => !waits(o)) : there;
    // Nobody else runs there now: the wait is over.
    return held.length ? held.map((o) => ({ type: o.type, label: labelOf(o) })) : undefined;
  };

  // A long job still running stays listed, even past the 25 most recent, and
  // what runs or waits comes first.
  const live = (j: (typeof jobs)[number]) => j.status === "running" || j.status === "queued";
  const merged = [...jobs, ...runningAll.filter((r) => !jobs.some((j) => j.id === r.id))];
  const listed = [...merged.filter(live), ...merged.filter((j) => !live(j))];
  const items = listed.map((j) => ({
    id: j.id,
    type: j.type, // backup | restore | mirror | verify-destination
    status: j.status, // queued | running | succeeded | failed | skipped
    label: labelOf(j),
    progress: j.events[0]?.progress ?? null,
    message: j.events[0]?.message ?? null,
    error: j.error,
    createdAt: j.createdAt.toISOString(),
    finishedAt: j.finishedAt?.toISOString() ?? null,
    lockHeldBy: lockHolders(j) ?? null,
  }));

  return NextResponse.json({ items });
}
