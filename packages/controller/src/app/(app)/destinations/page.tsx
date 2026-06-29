import { prisma } from "@/lib/prisma";
import { DestinationsView, type DestinationItem } from "./destinations-view";

export const dynamic = "force-dynamic";

export default async function DestinationsPage() {
  const [destinations, sizeGroups, missingGroups] = await Promise.all([
    prisma.destination.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { snapshots: true, policies: true } } },
    }),
    prisma.snapshot.groupBy({ by: ["destinationId"], _sum: { sizeBytes: true }, where: { status: "succeeded" } }),
    prisma.snapshot.groupBy({ by: ["destinationId"], _count: { _all: true }, where: { status: "missing" } }),
  ]);

  const sizeByDest = new Map(sizeGroups.map((g) => [g.destinationId, g._sum.sizeBytes ?? 0n]));
  const missingByDest = new Map(missingGroups.map((g) => [g.destinationId, g._count._all]));
  const globalBytes = Array.from(sizeByDest.values()).reduce((a, b) => a + BigInt(b), 0n);

  const items: DestinationItem[] = destinations.map((dest) => ({
    dest,
    bytes: sizeByDest.get(dest.id) ?? 0n,
    missing: missingByDest.get(dest.id) ?? 0,
  }));

  return <DestinationsView items={items} globalBytes={globalBytes} />;
}
