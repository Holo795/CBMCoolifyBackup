import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeJob, serializeJobEvent } from "@/lib/api-serialize";

export const dynamic = "force-dynamic";

/** One job with its full event log (progress + messages), oldest first. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const j = await prisma.agentJob.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      snapshotId: true,
      restoreId: true,
      error: true,
      createdAt: true,
      finishedAt: true,
      events: { orderBy: { ts: "asc" }, select: { level: true, message: true, progress: true, ts: true } },
    },
  });
  if (!j) return NextResponse.json({ error: "not found" }, { status: 404 });

  const label = j.snapshotId
    ? (await prisma.snapshot.findUnique({ where: { id: j.snapshotId }, select: { resource: { select: { name: true } } } }))?.resource.name ?? null
    : j.restoreId
      ? (await prisma.restoreJob.findUnique({ where: { id: j.restoreId }, select: { snapshot: { select: { resource: { select: { name: true } } } } } }))?.snapshot.resource.name ?? null
      : null;
  const last = j.events[j.events.length - 1];

  return NextResponse.json({
    ...serializeJob({ ...j, label, progress: last?.progress ?? null, message: last?.message ?? null }),
    snapshotId: j.snapshotId,
    restoreId: j.restoreId,
    events: j.events.map(serializeJobEvent),
  });
}
