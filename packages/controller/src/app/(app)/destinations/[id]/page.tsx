import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n";
import { DestinationDetailView } from "./detail-view";

export const dynamic = "force-dynamic";

export default async function DestinationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const dest = await prisma.destination.findUnique({ where: { id } });
  if (!dest) notFound();

  const groups = await prisma.snapshot.groupBy({
    by: ["resourceId"],
    _sum: { sizeBytes: true },
    _count: true,
    where: { destinationId: id, status: "succeeded" },
  });

  // For a "local" destination the files are physically split across each
  // producing agent's host - break the storage down by server so the size
  // isn't a misleading single number.
  const serverGroups = await prisma.snapshot.groupBy({
    by: ["agentId"],
    _sum: { sizeBytes: true },
    _count: true,
    where: { destinationId: id, status: "succeeded" },
  });
  const agentIds = serverGroups.map((g) => g.agentId).filter((x): x is string => !!x);
  const agentRows = await prisma.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, hostname: true, serverName: true },
  });
  const agentById = new Map(agentRows.map((a) => [a.id, a]));
  // restic stores identical data once: show what it really takes, once measured.
  const isRestic = dest.engine === "restic";
  const [resourceUsage, repoUsage] = isRestic
    ? await Promise.all([
        prisma.resourceUsage.findMany({ where: { destinationId: id } }),
        prisma.repoUsage.findMany({ where: { destinationId: id } }),
      ])
    : [[], []];
  const usageByResource = new Map(resourceUsage.map((u) => [u.resourceId, Number(u.bytes)]));
  const usageByScope = new Map(repoUsage.map((u) => [u.scope, Number(u.bytes)]));
  const serverRows = serverGroups
    .map((g) => {
      const a = g.agentId ? agentById.get(g.agentId) : undefined;
      return {
        key: g.agentId ?? "unknown",
        label: a?.serverName ?? a?.hostname ?? t("destinations.unknownHost"),
        bytes: usageByScope.get(g.agentId ?? "") ?? Number(g._sum.sizeBytes ?? 0n),
        count: g._count,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
  const showByServer = dest.type === "local" && serverRows.length > 1;

  const missingCount = await prisma.snapshot.count({ where: { destinationId: id, status: "missing" } });
  const resources = await prisma.resource.findMany({
    where: { id: { in: groups.map((g) => g.resourceId) } },
    select: { id: true, name: true, type: true },
  });
  const byId = new Map(resources.map((r) => [r.id, r]));

  const rows = groups
    .map((g) => ({
      id: g.resourceId,
      bytes: usageByResource.get(g.resourceId) ?? Number(g._sum.sizeBytes ?? 0n),
      logical: Number(g._sum.sizeBytes ?? 0n),
      count: g._count,
      name: byId.get(g.resourceId)?.name ?? t("destinations.deletedResource"),
      type: byId.get(g.resourceId)?.type,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const logicalTotal = rows.reduce((acc, r) => acc + r.logical, 0);
  // The repository as a whole (resources share data, so not the sum of rows).
  const total = repoUsage.length ? [...usageByScope.values()].reduce((a, b) => a + b, 0) : logicalTotal;

  return (
    <DestinationDetailView
      name={dest.name}
      type={dest.type}
      encryptionEnabled={dest.encryptionEnabled}
      total={total}
      logicalTotal={isRestic && repoUsage.length ? logicalTotal : null}
      missingCount={missingCount}
      showByServer={showByServer}
      serverRows={serverRows}
      rows={rows}
    />
  );
}
