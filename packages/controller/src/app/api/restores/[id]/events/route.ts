import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSessionUser } from "@/lib/api-session";

/** Live log feed for a restore job - polled by the LiveLog client component. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Same session and two-factor policy as the pages (lib/api-session).
  const session = await apiSessionUser();
  if (session.error) return session.error;
  const { id } = await params;

  const restore = await prisma.restoreJob.findUnique({ where: { id }, select: { status: true } });
  if (!restore) return NextResponse.json({ error: "not found" }, { status: 404 });

  const job = await prisma.agentJob.findFirst({
    where: { restoreId: id },
    include: { events: { orderBy: { ts: "asc" } } },
  });

  return NextResponse.json({
    status: restore.status,
    events: (job?.events ?? []).map((e) => ({
      ts: e.ts,
      level: e.level,
      message: e.message,
      progress: e.progress,
    })),
  });
}
