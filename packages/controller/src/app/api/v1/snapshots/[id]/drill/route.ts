import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { enqueueDrill } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/**
 * Test-restore a snapshot: an agent restores it into a throwaway sandbox
 * (never Coolify, never the original resource) and records the outcome — read
 * it back with GET /api/v1/snapshots/:id (`lastDrill`). Needs operator+.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi(req, "operator");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const snap = await prisma.snapshot.findUnique({ where: { id }, select: { id: true } });
  if (!snap) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const { drillId, jobId } = await enqueueDrill(id, "api");
    return NextResponse.json({ queued: true, drillId, jobId }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ queued: false, error: e instanceof Error ? e.message : "test restore failed" }, { status: 409 });
  }
}
