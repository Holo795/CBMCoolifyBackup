import type { PruneJob } from "@cbm/shared";
import { makeTransfer } from "./transfer.js";
import { resticEnv, resticForget } from "./restic.js";
import type { Emit } from "./backup.js";

/** Delete backups from a destination: restic forget+prune, or tar file removal. */
export async function runPrune(job: PruneJob, emit: Emit): Promise<void> {
  if (job.storage.engine === "restic") {
    const ids = job.resticSnapshotIds ?? [];
    if (ids.length === 0) return;
    if (!job.storage.resticPassword) throw new Error("restic prune requires the repository password");
    emit("info", `Forgetting ${ids.length} restic snapshot(s) and pruning`, 10);
    await resticForget(resticEnv(job.destination, job.storage.resticPassword), ids);
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
    }
    emit("info", `Deleted ${job.dirs.length} backup director${job.dirs.length === 1 ? "y" : "ies"}`);
  } finally {
    await transfer.close().catch(() => undefined);
  }
}
