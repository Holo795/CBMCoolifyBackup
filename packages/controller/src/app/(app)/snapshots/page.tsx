import { prisma } from "@/lib/prisma";
import { liveAgentWhere } from "@/lib/agent-status";
import { SnapshotsView } from "./snapshots-view";

export const dynamic = "force-dynamic";

export default async function SnapshotsPage() {
  const [snapshots, liveAgents] = await Promise.all([
    prisma.snapshot.findMany({
      orderBy: { startedAt: "desc" },
      take: 100,
      include: { resource: true, destination: true, _count: { select: { artifacts: true } } },
    }),
    prisma.agent.findMany({
      where: liveAgentWhere(),
      select: { instanceId: true },
    }),
  ]);
  const liveInstanceIds = new Set(liveAgents.map((a) => a.instanceId).filter(Boolean));

  return <SnapshotsView snapshots={snapshots} liveInstanceIds={liveInstanceIds} />;
}
