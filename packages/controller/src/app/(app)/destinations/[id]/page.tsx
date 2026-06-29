import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DestinationDetailView } from "./detail-view";

export const dynamic = "force-dynamic";

export default async function DestinationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const serverRows = serverGroups
    .map((g) => {
      const a = g.agentId ? agentById.get(g.agentId) : undefined;
      return {
        key: g.agentId ?? "unknown",
        label: a?.serverName ?? a?.hostname ?? "Unknown host",
        bytes: Number(g._sum.sizeBytes ?? 0n),
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
      bytes: Number(g._sum.sizeBytes ?? 0n),
      count: g._count,
      name: byId.get(g.resourceId)?.name ?? "(deleted resource)",
      type: byId.get(g.resourceId)?.type,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const total = rows.reduce((acc, r) => acc + r.bytes, 0);

  return (
    <DestinationDetailView
      name={dest.name}
      type={dest.type}
      encryptionEnabled={dest.encryptionEnabled}
      total={total}
      missingCount={missingCount}
      showByServer={showByServer}
      serverRows={serverRows}
      rows={rows}
    />
  );
}
