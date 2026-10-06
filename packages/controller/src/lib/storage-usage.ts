import { prisma } from "./prisma";

/*
 * What backups take: the logical size (the sum of each snapshot's files) and
 * what is really on disk. A tar destination stores each snapshot whole, so the
 * two match; a restic one stores identical data once, measured by the daily
 * reconciliation (`restic stats`) - unknown until then.
 */

export type Usage = { logical: number; disk: number | null; snapshots: number };

/** A resource's backups, across destinations. `disk` is null while a restic
 * destination holding some hasn't been measured yet. */
export async function resourceUsage(resourceId: string): Promise<Usage> {
  const [groups, measured] = await Promise.all([
    prisma.snapshot.groupBy({
      by: ["destinationId"],
      where: { resourceId, status: "succeeded" },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
    prisma.resourceUsage.findMany({ where: { resourceId } }),
  ]);
  const engines = new Map(
    (await prisma.destination.findMany({ where: { id: { in: groups.map((g) => g.destinationId) } }, select: { id: true, engine: true } })).map(
      (d) => [d.id, d.engine],
    ),
  );
  const byDest = new Map(measured.map((m) => [m.destinationId, Number(m.bytes)]));
  let logical = 0;
  let disk: number | null = 0;
  let snapshots = 0;
  for (const g of groups) {
    const size = Number(g._sum.sizeBytes ?? 0);
    logical += size;
    snapshots += g._count._all;
    if (engines.get(g.destinationId) !== "restic") disk = disk == null ? null : disk + size;
    else disk = disk == null || !byDest.has(g.destinationId) ? null : disk + byDest.get(g.destinationId)!;
  }
  return { logical, disk, snapshots };
}

/** What each restic repository really stores (summed over the hosts of a
 * "local" destination), by destination id; absent = not measured yet. */
export async function repoUsageByDestination(): Promise<Map<string, { bytes: number; measuredAt: Date }>> {
  const rows = await prisma.repoUsage.findMany();
  const out = new Map<string, { bytes: number; measuredAt: Date }>();
  for (const r of rows) {
    const cur = out.get(r.destinationId);
    out.set(r.destinationId, {
      bytes: (cur?.bytes ?? 0) + Number(r.bytes),
      measuredAt: cur && cur.measuredAt < r.measuredAt ? cur.measuredAt : r.measuredAt,
    });
  }
  return out;
}
