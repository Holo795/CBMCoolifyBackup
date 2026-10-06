import { prisma } from "@/lib/prisma";
import { liveAgentWhere } from "@/lib/agent-status";
import { getTimezone } from "@/lib/settings";
import { SnapshotsView } from "./snapshots-view";
import { DESTINATION_SECRETS } from "@/lib/public-fields";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const STATUSES = ["succeeded", "failed", "running", "missing", "corrupt", "skipped", "deleting"];

export default async function SnapshotsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const { page: pageParam, q, status } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const where = {
    ...(q ? { resource: { name: { contains: q, mode: "insensitive" as const } } } : {}),
    ...(status && STATUSES.includes(status) ? { status } : {}),
  };
  const [total, snapshots, liveAgents, tz, instances] = await Promise.all([
    prisma.snapshot.count({ where }),
    prisma.snapshot.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        resource: true,
        destination: { omit: DESTINATION_SECRETS },
        _count: { select: { artifacts: true, mirrors: true } },
        // Latest test-restore, for the "restore verified" badge.
        drills: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
    prisma.agent.findMany({
      where: liveAgentWhere(),
      select: { instanceId: true },
    }),
    getTimezone(),
    // Offered as "Restore onto" targets by Clone when several instances are connected.
    prisma.coolifyInstance.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  const liveInstanceIds = new Set(liveAgents.map((a) => a.instanceId).filter(Boolean));

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <SnapshotsView
      snapshots={snapshots}
      liveInstanceIds={liveInstanceIds}
      instances={instances}
      page={page}
      totalPages={totalPages}
      total={total}
      tz={tz}
      statuses={STATUSES}
      query={{ q, status }}
    />
  );
}
