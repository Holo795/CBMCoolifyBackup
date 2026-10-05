import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { enqueueVerifyDestination } from "@/lib/jobs";
import { parseQuery, verifyQuery } from "@/lib/api-validate";

export const dynamic = "force-dynamic";

/**
 * Verify a destination's snapshots are present (and, with `?deep=true`, intact:
 * restic re-reads a data subset, tar decrypts artifacts). Needs operator+.
 * Returns how many verify jobs were queued.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi(req, "operator");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const dest = await prisma.destination.findUnique({ where: { id }, select: { id: true } });
  if (!dest) return NextResponse.json({ error: "not found" }, { status: 404 });

  const q = parseQuery(verifyQuery, req);
  if (!q.ok) return q.response;
  const deep = q.data.deep === "true";
  try {
    const res = await enqueueVerifyDestination(id, { deep });
    if (res.queued === 0) return NextResponse.json({ queued: 0, reason: res.reason ?? "empty" }, { status: 409 });
    return NextResponse.json({ queued: res.queued, deep }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ queued: 0, error: e instanceof Error ? e.message : "verify failed" }, { status: 409 });
  }
}
