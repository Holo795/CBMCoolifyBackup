import { prisma } from "./prisma";
import { enqueuePrune, groupSnapshotsForPrune } from "./jobs";

/**
 * The one way snapshots are deleted (retention, the delete button, a sync copy
 * superseded by a newer one). Their files are deleted on the destination by an
 * agent FIRST; a row is removed only once that prune succeeded (see the prune
 * branch of the job result route). Until then the snapshot is "deleting": never
 * offered for restore, and retried if the prune fails or no agent could take
 * it. Deleting rows as soon as a prune was merely queued orphaned the files
 * whenever it then failed.
 *
 * Nothing is ever deleted on a protected destination. Mirror copies go along
 * only as asked (`mirrors`): "all" (the delete button, when asked), "follow"
 * (retention: the copies whose destination keeps mirror copies like their
 * source) or "none".
 */
export type MirrorRemoval = "all" | "follow" | "none";

/** Anything stored to delete? (A failed run may have written nothing.) */
function hasFiles(s: { destinationDir: string; resticSnapshotId: string | null; destination: { engine: string } }): boolean {
  return s.destination.engine === "restic" ? !!s.resticSnapshotId : !!s.destinationDir;
}

export async function removeSnapshots(
  ids: string[],
  mirrors: MirrorRemoval = "none",
): Promise<{ deleting: number; removed: number; kept: number }> {
  if (ids.length === 0) return { deleting: 0, removed: 0, kept: 0 };
  const copies =
    mirrors === "all"
      ? [{ mirrorOfId: { in: ids } }]
      : mirrors === "follow"
        ? [{ mirrorOfId: { in: ids }, destination: { mirrorRetention: "source" } }]
        : [];
  // A backup still running is never touched.
  const found = await prisma.snapshot.findMany({
    where: { OR: [{ id: { in: ids } }, ...copies], status: { not: "running" } },
    include: { destination: true, resource: { select: { instanceId: true } } },
  });
  // Protected destination: kept (and back to normal if a deletion was pending
  // from before it was protected).
  const kept = found.filter((s) => s.destination.protected);
  if (kept.length) {
    await prisma.snapshot.updateMany({
      where: { id: { in: kept.map((s) => s.id) }, status: "deleting" },
      data: { status: "succeeded", deleteRequestedAt: null, error: null },
    });
  }
  const snaps = found.filter((s) => !s.destination.protected);

  const noFiles = snaps.filter((s) => !hasFiles(s));
  if (noFiles.length > 0) await prisma.snapshot.deleteMany({ where: { id: { in: noFiles.map((s) => s.id) } } });

  const withFiles = snaps.filter(hasFiles);
  if (withFiles.length === 0) return { deleting: 0, removed: noFiles.length, kept: kept.length };
  await prisma.snapshot.updateMany({
    where: { id: { in: withFiles.map((s) => s.id) } },
    data: { status: "deleting", deleteRequestedAt: new Date(), error: null },
  });

  const groups = groupSnapshotsForPrune(
    withFiles.map((s) => ({
      id: s.id,
      destinationDir: s.destinationDir,
      agentId: s.agentId,
      resticSnapshotId: s.resticSnapshotId,
      resticPartIds: s.resticPartIds,
      instanceId: s.resource.instanceId,
      destination: s.destination,
    })),
  );
  for (const g of groups) {
    const queued = await enqueuePrune({
      instanceId: g.instanceId,
      destination: g.destination,
      dirs: g.dirs,
      resticSnapshotIds: g.resticSnapshotIds,
      agentId: g.agentId,
      snapshotIds: g.snapshotIds,
    }).catch((e) => {
      console.warn(`[delete] prune enqueue failed: ${(e as Error).message}`);
      return null;
    });
    if (!queued) {
      await prisma.snapshot.updateMany({
        where: { id: { in: g.snapshotIds } },
        data: { error: "No agent available to delete the files yet - retried automatically" },
      });
    }
  }
  return { deleting: withFiles.length, removed: noFiles.length, kept: kept.length };
}

/** A prune job finished: drop the rows it deleted, or keep them for a retry. */
export async function settlePrune(snapshotIds: string[], succeeded: boolean, error?: string): Promise<void> {
  if (snapshotIds.length === 0) return;
  if (succeeded) {
    await prisma.snapshot.deleteMany({ where: { id: { in: snapshotIds }, status: "deleting" } });
  } else {
    await prisma.snapshot.updateMany({
      where: { id: { in: snapshotIds }, status: "deleting" },
      data: { error: `Deleting the files failed: ${error ?? "unknown error"} - retried automatically` },
    });
  }
}

/** Longer than a prune may wait in the queue (7 days), so a pending one is never doubled. */
const STUCK_DELETION_MS = 8 * 24 * 3600_000;

/**
 * Retry deletions that failed, never found an agent, or got lost (e.g. their
 * prune job expired). Runs periodically from the scheduler.
 */
export async function retryStuckDeletions(now: Date): Promise<number> {
  const stuck = await prisma.snapshot.findMany({
    where: {
      status: "deleting",
      OR: [
        { error: { not: null } },
        { deleteRequestedAt: null },
        { deleteRequestedAt: { lt: new Date(now.getTime() - STUCK_DELETION_MS) } },
      ],
    },
    select: { id: true },
    take: 500,
  });
  if (stuck.length === 0) return 0;
  await removeSnapshots(stuck.map((s) => s.id));
  return stuck.length;
}
