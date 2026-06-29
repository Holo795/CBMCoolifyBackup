import { prisma } from "@/lib/prisma";
import { liveAgentWhere } from "@/lib/agent-status";
import { ResourcesView } from "./resources-view";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const { q, type, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam || "1"));
  const where = {
    status: { not: "deleted" },
    // Control-plane (coolify-self) resources are pinned at the top separately.
    NOT: { coolifyUuid: { startsWith: "coolify-self" } },
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(type ? { type } : {}),
  };
  const [total, controlPlanes, resources, orphaned] = await Promise.all([
    prisma.resource.count({ where }),
    // Control planes: always shown, pinned at the top of every page.
    prisma.resource.findMany({
      where: { status: { not: "deleted" }, coolifyUuid: { startsWith: "coolify-self" } },
      orderBy: [{ name: "asc" }],
      include: { instance: true },
    }),
    prisma.resource.findMany({
      where,
      orderBy: [{ projectName: "asc" }, { name: "asc" }],
      include: { instance: true },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    // Resources removed from Coolify but kept for their backups.
    prisma.resource.findMany({
      where: { status: "deleted" },
      orderBy: [{ projectName: "asc" }, { name: "asc" }],
      include: { instance: true, _count: { select: { snapshots: true } } },
    }),
  ]);
  // Which instances have a live agent (recent heartbeat)? Resources whose
  // instance has none can't be backed up, so we grey them out + disable backup.
  const liveAgents = await prisma.agent.findMany({
    where: liveAgentWhere(),
    select: { instanceId: true },
  });
  const liveInstanceIds = new Set(liveAgents.map((a) => a.instanceId).filter(Boolean));

  // Control planes first (pinned), then this page's resources.
  const rows = [...controlPlanes, ...resources];

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <ResourcesView
      rows={rows}
      orphaned={orphaned}
      liveInstanceIds={liveInstanceIds}
      total={total}
      page={page}
      totalPages={totalPages}
      q={q}
      type={type}
    />
  );
}
