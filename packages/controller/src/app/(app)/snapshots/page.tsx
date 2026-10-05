import { prisma } from "@/lib/prisma";
import { liveAgentWhere } from "@/lib/agent-status";
import { SnapshotsView } from "./snapshots-view";
import { DESTINATION_SECRETS } from "@/lib/public-fields";

export const dynamic = "force-dynamic";

export default async function SnapshotsPage() {
  const [snapshots, liveAgents] = await Promise.all([
    prisma.snapshot.findMany({
      orderBy: { startedAt: "desc" },
      take: 100,
      include: {
        resource: true,
        destination: { omit: DESTINATION_SECRETS },
        _count: { select: { artifacts: true } },
        // Latest test-restore, for the "restore verified" badge.
        drills: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
    prisma.agent.findMany({
      where: liveAgentWhere(),
      select: { instanceId: true },
    }),
  ]);
  const liveInstanceIds = new Set(liveAgents.map((a) => a.instanceId).filter(Boolean));

  return <SnapshotsView snapshots={snapshots} liveInstanceIds={liveInstanceIds} />;
}
