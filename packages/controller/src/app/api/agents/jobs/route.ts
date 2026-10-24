import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAgentFromRequest } from "@/lib/agent-auth";
import { nextJob } from "@/lib/job-order";

/**
 * Long-poll: hand the next queued job to this agent, or 204 when idle.
 * The claim is atomic (queued → running only if still queued), so a job can
 * never be handed out twice. Which job goes first: see lib/job-order.
 */
export async function GET(req: Request) {
  const agent = await authenticateAgentFromRequest(req);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.agent.update({
    where: { id: agent.id },
    data: { status: "online", lastSeenAt: new Date() },
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const [queued, pruning] = await Promise.all([
      prisma.agentJob.findMany({
        where: { agentId: agent.id, status: "queued" },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, payload: true },
      }),
      // Prunes running anywhere (on any agent): their destination is taken.
      prisma.agentJob.findMany({ where: { type: "prune", status: "running" }, select: { payload: true } }),
    ]);
    const busy = new Set(pruning.map((j) => destinationOf(j.payload)).filter((d): d is string => !!d));
    const job = nextJob(
      queued.map((j) => ({ id: j.id, type: j.type, destinationId: destinationOf(j.payload) })),
      busy,
    );
    if (!job) break;
    const claimed = await prisma.agentJob.updateMany({
      where: { id: job.id, status: "queued" },
      data: { status: "running", claimedAt: new Date() },
    });
    if (claimed.count === 1) {
      // Read once taken: a prune may have had snapshots added to it until then.
      const taken = await prisma.agentJob.findUnique({ where: { id: job.id }, select: { payload: true } });
      return NextResponse.json({ job: taken?.payload });
    }
    // Someone else changed it in between (expired, cancelled): try the next one.
  }
  return new NextResponse(null, { status: 204 });
}

function destinationOf(payload: unknown): string | null {
  const id = (payload as { destinationId?: unknown } | null)?.destinationId;
  return typeof id === "string" ? id : null;
}
