import { prisma } from "@/lib/prisma";
import { liveAgentWhere } from "@/lib/agent-status";
import { SnapshotsView } from "./snapshots-view";
import { DESTINATION_SECRETS } from "@/lib/public-fields";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

export default async function SnapshotsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const [total, snapshots, liveAgents] = await Promise.all([
    prisma.snapshot.count(),
    prisma.snapshot.findMany({
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
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

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return <SnapshotsView snapshots={snapshots} liveInstanceIds={liveInstanceIds} page={page} totalPages={totalPages} />;
}
