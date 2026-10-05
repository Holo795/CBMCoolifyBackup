import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAgentFromRequest } from "@/lib/agent-auth";

/**
 * Long-poll: hand the next queued job to this agent, or 204 when idle.
 * The claim is atomic (queued → running only if still queued), so a job can
 * never be handed out twice.
 */
export async function GET(req: Request) {
  const agent = await authenticateAgentFromRequest(req);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.agent.update({
    where: { id: agent.id },
    data: { status: "online", lastSeenAt: new Date() },
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const job = await prisma.agentJob.findFirst({
      where: { agentId: agent.id, status: "queued" },
      orderBy: { createdAt: "asc" },
      select: { id: true, payload: true },
    });
    if (!job) break;
    const claimed = await prisma.agentJob.updateMany({
      where: { id: job.id, status: "queued" },
      data: { status: "running", claimedAt: new Date() },
    });
    if (claimed.count === 1) return NextResponse.json({ job: job.payload });
    // Someone else changed it in between (expired, cancelled): try the next one.
  }
  return new NextResponse(null, { status: 204 });
}
