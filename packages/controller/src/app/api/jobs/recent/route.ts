import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Recent agent jobs for the activity bar: running + recently finished backups,
 * restores, mirrors and destination checks, newest first. Any signed-in user
 * can see the fleet's activity.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const jobs = await prisma.agentJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      type: true,
      status: true,
      snapshotId: true,
      restoreId: true,
      error: true,
      createdAt: true,
      finishedAt: true,
      events: { orderBy: { ts: "desc" }, take: 1, select: { progress: true, message: true } },
    },
  });

  // Resolve a human label per job: the resource name for backups/restores.
  const snapIds = jobs.map((j) => j.snapshotId).filter((x): x is string => !!x);
  const restoreIds = jobs.map((j) => j.restoreId).filter((x): x is string => !!x);
  const [snaps, restores] = await Promise.all([
    snapIds.length
      ? prisma.snapshot.findMany({ where: { id: { in: snapIds } }, select: { id: true, resource: { select: { name: true } } } })
      : [],
    restoreIds.length
      ? prisma.restoreJob.findMany({
          where: { id: { in: restoreIds } },
          select: { id: true, snapshot: { select: { resource: { select: { name: true } } } } },
        })
      : [],
  ]);
  const snapName = new Map(snaps.map((s) => [s.id, s.resource.name]));
  const restoreName = new Map(restores.map((r) => [r.id, r.snapshot.resource.name]));

  const items = jobs.map((j) => ({
    id: j.id,
    type: j.type, // backup | restore | mirror | verify-destination
    status: j.status, // queued | running | succeeded | failed | skipped
    label: j.snapshotId ? snapName.get(j.snapshotId) : j.restoreId ? restoreName.get(j.restoreId) : null,
    progress: j.events[0]?.progress ?? null,
    message: j.events[0]?.message ?? null,
    error: j.error,
    createdAt: j.createdAt.toISOString(),
    finishedAt: j.finishedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ items });
}
