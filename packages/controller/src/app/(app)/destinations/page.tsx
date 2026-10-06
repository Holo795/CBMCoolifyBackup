import { prisma } from "@/lib/prisma";
import { DestinationsView, type DestinationItem } from "./destinations-view";
import { DESTINATION_SECRETS } from "@/lib/public-fields";
import { repoUsageByDestination } from "@/lib/storage-usage";

export const dynamic = "force-dynamic";

export default async function DestinationsPage() {
  const [destinations, sizeGroups, missingGroups, repoUsage] = await Promise.all([
    prisma.destination.findMany({
      orderBy: { createdAt: "asc" },
      omit: DESTINATION_SECRETS,
      include: { _count: { select: { snapshots: true, policies: true } } },
    }),
    prisma.snapshot.groupBy({ by: ["destinationId"], _sum: { sizeBytes: true }, where: { status: "succeeded" } }),
    prisma.snapshot.groupBy({ by: ["destinationId"], _count: { _all: true }, where: { status: "missing" } }),
    repoUsageByDestination(),
  ]);

  const sizeByDest = new Map(sizeGroups.map((g) => [g.destinationId, g._sum.sizeBytes ?? 0n]));
  const missingByDest = new Map(missingGroups.map((g) => [g.destinationId, g._count._all]));
  const items: DestinationItem[] = destinations.map((dest) => ({
    dest,
    bytes: sizeByDest.get(dest.id) ?? 0n,
    // restic stores identical data once: what the repository really takes.
    disk: dest.engine === "restic" ? (repoUsage.get(dest.id) ?? null) : null,
    missing: missingByDest.get(dest.id) ?? 0,
  }));
  // On disk where measured, the logical size elsewhere (tar: the same).
  const globalBytes = items.reduce((n, i) => n + (i.disk ? BigInt(i.disk.bytes) : BigInt(i.bytes)), 0n);

  return <DestinationsView items={items} globalBytes={globalBytes} />;
}
