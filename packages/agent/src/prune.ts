import { posix } from "node:path";
import type { PruneJob } from "@cbm/shared";
import { makeTransfer, type Transfer } from "./transfer.js";
import { LOCK_WAIT_MESSAGE, resticForget, resticStaleWarmIds, withResticCtx } from "./restic.js";
import type { Emit } from "./backup.js";

/**
 * After deleting a snapshot directory, walk up and remove any parent directory
 * that is now empty (e.g. `<instance>/<uuid>/backups/` and `<uuid>/`), so the
 * destination doesn't accumulate empty shells. `list` is recursive and returns
 * files only, so a zero-length result means the directory holds nothing.
 */
async function removeEmptyParents(transfer: Transfer, dir: string): Promise<void> {
  let parent = posix.dirname(dir);
  while (parent && parent !== "." && parent !== "/") {
    const files = await transfer.list(parent).catch(() => null);
    if (files === null || files.length > 0) break;
    await transfer.removeDir(parent).catch(() => undefined);
    parent = posix.dirname(parent);
  }
}

/** Delete backups from a destination: restic forget+prune, or tar file removal. */
export async function runPrune(job: PruneJob, emit: Emit): Promise<void> {
  if (job.storage.engine === "restic") {
    const ids = job.resticSnapshotIds ?? [];
    if (ids.length === 0) return;
    if (!job.storage.resticPassword) throw new Error("restic prune requires the repository password");
    await withResticCtx(job.destination, job.storage.resticPassword, async (ctx) => {
      ctx.onLockWait = () => emit("info", LOCK_WAIT_MESSAGE);
      // Backups' first passes, left as their final pass's parent: this prune
      // takes the exclusive lock anyway, so they go with it.
      const warm = (await resticStaleWarmIds(ctx)).filter((id) => !ids.includes(id));
      emit("info", `Forgetting ${ids.length} restic snapshot(s)${warm.length ? ` and ${warm.length} first-pass snapshot(s)` : ""} and pruning`, 10);
      await resticForget(ctx, [...ids, ...warm]);
    });
    emit("info", "Prune complete", 100);
    return;
  }
  if (job.dirs.length === 0) return;
  const transfer = await makeTransfer(job.destination);
  try {
    let i = 0;
    for (const dir of job.dirs) {
      i++;
      emit("info", `Deleting ${dir}`, Math.round((i / job.dirs.length) * 100));
      await transfer.removeDir(dir);
      await removeEmptyParents(transfer, dir);
    }
    emit("info", `Deleted ${job.dirs.length} backup director${job.dirs.length === 1 ? "y" : "ies"}`);
  } finally {
    await transfer.close().catch(() => undefined);
  }
}
