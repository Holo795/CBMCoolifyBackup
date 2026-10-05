import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeSnapshot } from "@/lib/api-serialize";

export const dynamic = "force-dynamic";

/** One snapshot, with its artifact list (filename, kind, size, checksum) and
 * the outcome of its latest test-restore. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const s = await prisma.snapshot.findUnique({
    where: { id },
    select: {
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
      destinationDir: true,
      startedAt: true,
      finishedAt: true,
      lastCheckedAt: true,
      resource: { select: { name: true } },
      destination: { select: { name: true } },
      _count: { select: { artifacts: true } },
      artifacts: { select: { kind: true, filename: true, sizeBytes: true, sha256: true, encrypted: true } },
      drills: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, trigger: true, checks: true, error: true, createdAt: true, finishedAt: true },
      },
    },
  });
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const d = s.drills[0];

  return NextResponse.json({
    ...serializeSnapshot(s),
    destinationDir: s.destinationDir,
    artifacts: s.artifacts.map((a) => ({
      kind: a.kind,
      filename: a.filename,
      sizeBytes: a.sizeBytes == null ? null : a.sizeBytes.toString(),
      sha256: a.sha256,
      encrypted: a.encrypted,
    })),
    // Latest test-restore (passed | failed | error | running), or null.
    lastDrill: d
      ? {
          id: d.id,
          status: d.status,
          trigger: d.trigger,
          checks: d.checks ?? [],
          error: d.error,
          createdAt: d.createdAt.toISOString(),
          finishedAt: d.finishedAt?.toISOString() ?? null,
        }
      : null,
  });
}
