import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { liveAgentWhere } from "@/lib/agent-status";
import { ResourcesView } from "./resources-view";
import { INSTANCE_SECRETS } from "@/lib/public-fields";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

/** A server filter value for resources whose server isn't known. */
const NO_SERVER = "none";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; instance?: string; server?: string; group?: string; page?: string }>;
}) {
  const { q, type, instance, server, group: groupParam, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam || "1"));
  const group = groupParam === "instance" || groupParam === "server" ? groupParam : undefined;
  const where: Prisma.ResourceWhereInput = {
    status: { not: "deleted" },
    // Control-plane (coolify-self) resources are pinned at the top separately.
    NOT: { coolifyUuid: { startsWith: "coolify-self" } },
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(type ? { type } : {}),
    ...(instance ? { instanceId: instance } : {}),
    ...(server ? { serverUuid: server === NO_SERVER ? null : server } : {}),
  };
  // Grouped: rows come sorted by the group so each one is contiguous.
  const orderBy: Prisma.ResourceOrderByWithRelationInput[] = [
    ...(group ? [{ instance: { name: "asc" as const } }, { instanceId: "asc" as const }] : []),
    ...(group === "server" ? [{ serverName: { sort: "asc" as const, nulls: "last" as const } }, { serverUuid: "asc" as const }] : []),
    { projectName: "asc" },
    { name: "asc" },
    // Same project and name (one per environment): a fixed order, so a row
    // never moves when it's updated (e.g. by its "Scheduled" switch).
    { environment: "asc" },
    { id: "asc" },
  ];
  const [total, controlPlanes, resources, orphaned, typeRows, instances, servers, groupCounts] = await Promise.all([
    prisma.resource.count({ where }),
    // Control planes: always shown, pinned at the top of every page.
    prisma.resource.findMany({
      where: { status: { not: "deleted" }, coolifyUuid: { startsWith: "coolify-self" } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: { instance: { omit: INSTANCE_SECRETS } },
    }),
    prisma.resource.findMany({
      where,
      orderBy,
      include: { instance: { omit: INSTANCE_SECRETS } },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    // Resources removed from Coolify but kept for their backups.
    prisma.resource.findMany({
      where: { status: "deleted" },
      orderBy: [{ projectName: "asc" }, { name: "asc" }, { environment: "asc" }, { id: "asc" }],
      include: { instance: { omit: INSTANCE_SECRETS }, _count: { select: { snapshots: true } } },
    }),
    // Distinct types, for the filter.
    prisma.resource.groupBy({ by: ["type"], where: { status: { not: "deleted" } }, orderBy: { type: "asc" } }),
    prisma.coolifyInstance.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Distinct servers (per instance), for the filter.
    prisma.resource.groupBy({
      by: ["instanceId", "serverUuid", "serverName"],
      where: { status: { not: "deleted" }, NOT: { coolifyUuid: { startsWith: "coolify-self" } } },
    }),
    // How many resources each group holds (all pages), for its header.
    group
      ? prisma.resource.groupBy({ by: group === "server" ? ["instanceId", "serverUuid"] : ["instanceId"], where, _count: { _all: true } })
      : Promise.resolve([]),
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
      types={typeRows.map((r) => r.type)}
      instance={instance}
      server={server}
      group={group}
      instances={instances}
      servers={servers
        .filter((sv) => !instance || sv.instanceId === instance)
        .map((sv) => ({
          value: sv.serverUuid ?? NO_SERVER,
          name: sv.serverName ?? sv.serverUuid ?? null,
          instanceName: instances.find((i) => i.id === sv.instanceId)?.name ?? "",
        }))
        .filter((sv, i, all) => all.findIndex((x) => x.value === sv.value) === i)}
      groupCounts={Object.fromEntries(
        (groupCounts as Array<{ instanceId: string; serverUuid?: string | null; _count: { _all: number } }>).map((g) => [
          group === "server" ? `${g.instanceId}:${g.serverUuid ?? NO_SERVER}` : g.instanceId,
          g._count._all,
        ]),
      )}
    />
  );
}
