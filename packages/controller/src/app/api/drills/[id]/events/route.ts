import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSessionUser } from "@/lib/api-session";

/** Live log feed for a restore drill - polled by the LiveLog client component. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Same session and two-factor policy as the pages (lib/api-session).
  const session = await apiSessionUser();
  if (session.error) return session.error;
  const { id } = await params;

  const drill = await prisma.restoreDrill.findUnique({ where: { id }, select: { status: true, agentJobId: true } });
  if (!drill) return NextResponse.json({ error: "not found" }, { status: 404 });

  const events = drill.agentJobId
    ? await prisma.jobEvent.findMany({ where: { jobId: drill.agentJobId }, orderBy: { ts: "asc" } })
    : [];

  return NextResponse.json({
    status: drill.status,
    events: events.map((e) => ({ ts: e.ts, level: e.level, message: e.message, progress: e.progress })),
  });
}
