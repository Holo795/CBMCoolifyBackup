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

    // Files first (mirror copies included), rows once they're gone - see
    // lib/snapshot-removal. A failed or agent-less deletion is retried there.
    await removeSnapshots(toDelete.map((s) => s.id));
    deleted += toDelete.length;
  }
  return { deleted };
}
