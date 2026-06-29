import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { liveAgentWhere } from "@/lib/agent-status";
import { getTimezone } from "@/lib/settings";
import { SnapshotDetailView } from "./detail-view";

export const dynamic = "force-dynamic";

export default async function SnapshotDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await prisma.snapshot.findUnique({
    where: { id },
    include: { resource: true, destination: true, artifacts: true },
  });
  if (!snapshot) notFound();

  const restores = await prisma.restoreJob.findMany({
    where: { snapshotId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Restore (and re-pin) need a live agent to execute on the host.
  const liveAgent = await prisma.agent.findFirst({
    where: liveAgentWhere(snapshot.resource.instanceId),
    select: { id: true },
  });
  const agentDown = !liveAgent;
  const tz = await getTimezone();

  return <SnapshotDetailView snapshot={snapshot} restores={restores} tz={tz} agentDown={agentDown} />;
}
