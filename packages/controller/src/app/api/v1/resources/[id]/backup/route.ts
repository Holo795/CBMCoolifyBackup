import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { enqueueBackup } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Trigger a manual backup of a resource. Needs an operator-or-above token. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi(req, "operator");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const resource = await prisma.resource.findUnique({ where: { id }, select: { id: true } });
  if (!resource) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const { jobId, snapshotId } = await enqueueBackup(id);
    return NextResponse.json({ queued: true, jobId, snapshotId }, { status: 202 });
  } catch (e) {
    // No destination / no online agent on the resource's server, etc.
    return NextResponse.json({ queued: false, error: e instanceof Error ? e.message : "backup failed" }, { status: 409 });
  }
}
