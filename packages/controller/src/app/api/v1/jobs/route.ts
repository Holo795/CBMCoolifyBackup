import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeJob } from "@/lib/api-serialize";

export const dynamic = "force-dynamic";

/**
 * Recent agent jobs (backup | restore | prune | mirror | verify-destination),
 * newest first, with a resolved resource label and live progress.
 * Filters: `?type=`, `?status=`, `?limit=` (default 25, max 100).
 */
export async function GET(req: Request) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100);

  const jobs = await prisma.agentJob.findMany({
    where: { ...(type ? { type } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
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

  const items = jobs.map((j) =>
    serializeJob({
      ...j,
      label: j.snapshotId ? snapName.get(j.snapshotId) : j.restoreId ? restoreName.get(j.restoreId) : null,
      progress: j.events[0]?.progress ?? null,
      message: j.events[0]?.message ?? null,
    }),
  );
  return NextResponse.json({ items });
}
