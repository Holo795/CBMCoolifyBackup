import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeSnapshot } from "@/lib/api-serialize";
import { parseQuery, snapshotsQuery } from "@/lib/api-validate";

export const dynamic = "force-dynamic";

const SNAP_SELECT = {
  id: true,
  resourceId: true,
  destinationId: true,
  mode: true,
  captureMode: true,
  status: true,
  sizeBytes: true,
  error: true,
  runId: true,
  resticSnapshotId: true,
  mirrorOfId: true,
  isMirror: true,
  resticPartIds: true,
  startedAt: true,
  finishedAt: true,
  lastCheckedAt: true,
  resource: { select: { name: true } },
  destination: { select: { name: true } },
  _count: { select: { artifacts: true } },
} as const;

/**
 * List snapshots, newest first.
 * Filters: `?resourceId=`, `?status=` (succeeded|failed|running|missing|corrupt|skipped),
 * `?limit=` (default 50, max 200).
 */
export async function GET(req: Request) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const q = parseQuery(snapshotsQuery, req);
  if (!q.ok) return q.response;
  const { resourceId, status } = q.data;
  const limit = q.data.limit ?? 50;

  const rows = await prisma.snapshot.findMany({
    where: { ...(resourceId ? { resourceId } : {}), ...(status ? { status } : {}) },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: SNAP_SELECT,
  });
  return NextResponse.json({ items: rows.map(serializeSnapshot) });
}
