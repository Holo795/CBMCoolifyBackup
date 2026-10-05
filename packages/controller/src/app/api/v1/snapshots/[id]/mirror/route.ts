import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { enqueueMirror } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/**
 * Mirror a snapshot to its destination's configured second destination.
 * Needs an operator-or-above token. 409 if the destination has no mirror set
 * (reason "no-mirror") or no online agent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi(req, "operator");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const snap = await prisma.snapshot.findUnique({ where: { id }, select: { id: true } });
  if (!snap) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const res = await enqueueMirror(id);
    if (!res.queued) return NextResponse.json({ queued: false, reason: res.reason ?? "unavailable" }, { status: 409 });
    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ queued: false, error: e instanceof Error ? e.message : "mirror failed" }, { status: 409 });
  }
}
