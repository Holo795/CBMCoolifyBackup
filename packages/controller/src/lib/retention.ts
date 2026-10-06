import { prisma } from "./prisma";
import { computeKeepSet } from "./gfs";
import { removeSnapshots } from "./snapshot-removal";

export { computeKeepSet } from "./gfs";

/**
 * Grandfather-father-son retention. Keeps the most recent N daily, plus a
 * number of distinct weekly and monthly snapshots; deletes the rest.
 *
 * Files are deleted on the destination by an agent "prune" job (the files live
 * on the agent host for `local`, and ssh/s3 are reachable from it); the DB
 * record is removed once that succeeded (lib/snapshot-removal).
 */
export async function applyRetention(policyId: string): Promise<{ deleted: number }> {
  const policy = await prisma.backupPolicy.findUnique({ where: { id: policyId } });
  if (!policy || policy.mode === "sync") return { deleted: 0 };

  const where = policy.resourceId
    ? { id: policy.resourceId }
    : policy.instanceId && policy.serverUuid
      ? { instanceId: policy.instanceId, serverUuid: policy.serverUuid, backupEnabled: true }
      : policy.instanceId
        ? { instanceId: policy.instanceId, backupEnabled: true }
        : { backupEnabled: true };
  const resources = await prisma.resource.findMany({ where, select: { id: true, instanceId: true } });

  let deleted = 0;
  for (const r of resources) {
    const snaps = await prisma.snapshot.findMany({
      where: { resourceId: r.id, policyId: policy.id, status: "succeeded" },
      orderBy: { startedAt: "desc" },
      include: { destination: true },
    });
    const keep = computeKeepSet(
      snaps.map((s) => ({ id: s.id, at: s.startedAt })),
      policy.retentionDaily,
      policy.retentionWeekly,
      policy.retentionMonthly,
    );
    const toDelete = snaps.filter((s) => !keep.has(s.id));
    if (toDelete.length === 0) continue;

    // Files first, rows once they're gone - see lib/snapshot-removal. Mirror
    // copies follow unless their destination keeps them by its own retention.
    // A failed or agent-less deletion is retried there.
    const res = await removeSnapshots(
      toDelete.map((s) => s.id),
      "follow",
    );
    deleted += res.deleting + res.removed;
  }
  return { deleted };
}

/**
 * Mirror copies on a destination that keeps them by its own retention: per
 * resource, keep the most recent daily / weekly / monthly copies by the
 * destination's counts, whatever happened to their source.
 */
export async function applyMirrorRetention(destinationId: string): Promise<{ deleted: number }> {
  const dest = await prisma.destination.findUnique({ where: { id: destinationId } });
  if (!dest || dest.protected || dest.mirrorRetention !== "own") return { deleted: 0 };
  const copies = await prisma.snapshot.findMany({
    where: { destinationId, isMirror: true, status: "succeeded" },
    orderBy: { startedAt: "desc" },
    select: { id: true, resourceId: true, startedAt: true },
  });
  const byResource = new Map<string, Array<{ id: string; at: Date }>>();
  for (const c of copies) byResource.set(c.resourceId, [...(byResource.get(c.resourceId) ?? []), { id: c.id, at: c.startedAt }]);
  const toDelete: string[] = [];
  for (const list of byResource.values()) {
    const keep = computeKeepSet(list, dest.mirrorKeepDaily, dest.mirrorKeepWeekly, dest.mirrorKeepMonthly);
    toDelete.push(...list.filter((c) => !keep.has(c.id)).map((c) => c.id));
  }
  if (toDelete.length === 0) return { deleted: 0 };
  const res = await removeSnapshots(toDelete, "none");
  return { deleted: res.deleting + res.removed };
}

/** Daily pass over every destination keeping mirror copies by its own retention. */
export async function applyAllMirrorRetention(): Promise<void> {
  const dests = await prisma.destination.findMany({ where: { mirrorRetention: "own", protected: false }, select: { id: true, name: true } });
  for (const d of dests) {
    await applyMirrorRetention(d.id).catch((e) => console.error(`[retention] mirror copies on ${d.name}:`, (e as Error).message));
  }
}
