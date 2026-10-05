import { prisma } from "@/lib/prisma";
import { getTimezone } from "@/lib/settings";
import { dailyVolume } from "@/lib/storage-stats";
import type { StorageData } from "@/components/storage-trends";
import { OverviewView } from "./overview-view";

export const dynamic = "force-dynamic";

const TREND_DAYS = 30;

export default async function OverviewPage() {
  const tz = await getTimezone();
  const now = new Date();
  // One extra day of margin so the oldest bucket is complete in any timezone.
  const since = new Date(now.getTime() - (TREND_DAYS + 1) * 86_400_000);

  const [instances, resources, enabled, snapshots, agentsOnline, recent, byDest, windowRows, dests] = await Promise.all([
    prisma.coolifyInstance.count(),
    prisma.resource.count(),
    prisma.resource.count({ where: { backupEnabled: true } }),
    prisma.snapshot.count({ where: { status: "succeeded" } }),
    prisma.agent.count({ where: { status: "online" } }),
    prisma.snapshot.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { resource: true },
    }),
    // What's held where right now (mirror copies count: they occupy that destination).
    prisma.snapshot.groupBy({
      by: ["destinationId"],
      where: { status: "succeeded" },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
    // What was backed up per day (originals only, so a mirror isn't counted twice).
    prisma.snapshot.findMany({
      where: { status: "succeeded", mirrorOfId: null, finishedAt: { gte: since } },
      select: { finishedAt: true, sizeBytes: true },
    }),
    prisma.destination.findMany({ select: { id: true, name: true, type: true, engine: true } }),
  ]);

  const destById = new Map(dests.map((d) => [d.id, d]));
  const storage: StorageData = {
    total: byDest.reduce((n, g) => n + Number(g._sum.sizeBytes ?? 0n), 0),
    daily: dailyVolume(windowRows, TREND_DAYS, tz, now),
    perDestination: byDest
      .map((g) => {
        const d = destById.get(g.destinationId);
        return d
          ? { id: d.id, name: d.name, type: d.type, engine: d.engine, bytes: Number(g._sum.sizeBytes ?? 0n), count: g._count._all }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  };

  return (
    <OverviewView
      counts={{ instances, resources, enabled, snapshots, agentsOnline }}
      recent={recent}
      storage={storage}
    />
  );
}
