import type { Job, JobResult, JobEvent } from "@cbm/shared";
import type { AgentConfig } from "./config.js";
import { runBackup, type Emit } from "./backup.js";
import { runRestore } from "./restore.js";
import { runPrune } from "./prune.js";
import { runVerifyDestination } from "./verify.js";
import { runMirror } from "./mirror.js";
import { runRestoreDrill } from "./drill.js";
import { logger } from "./logger.js";
import { sendEvent } from "./client.js";

/**
 * Execute a job, streaming events. `onEvent` receives every event (used to
 * forward to the controller). Returns the final JobResult.
 */
export async function executeJob(
  job: Job,
  workDir: string,
  onEvent?: (e: JobEvent) => void,
): Promise<JobResult> {
  const emit: Emit = (level, message, progress) => {
    const e: JobEvent = { jobId: job.id, ts: new Date().toISOString(), level, message, progress };
    logger[level](`[${job.id}] ${message}`);
    onEvent?.(e);
  };

  try {
    if (job.type === "backup") {
      const result = await runBackup(job, workDir, emit);
      if ("skipped" in result) {
        return { jobId: job.id, status: "skipped", error: result.reason };
      }
      return { jobId: job.id, status: "succeeded", manifest: result, resticSnapshotId: result.resticSnapshotId };
    } else if (job.type === "restore") {
      await runRestore(job, workDir, emit);
      return { jobId: job.id, status: "succeeded" };
    } else if (job.type === "verify-destination") {
      const verify = await runVerifyDestination(job, emit);
      return { jobId: job.id, status: "succeeded", verify };
    } else if (job.type === "mirror") {
      const { resticSnapshotId, manifest } = await runMirror(job, workDir, emit);
      return { jobId: job.id, status: "succeeded", resticSnapshotId, manifest };
    } else if (job.type === "restore-drill") {
      // The job itself succeeds when the drill ran; the verdict is in `drill`.
      const drill = await runRestoreDrill(job, workDir, emit);
      return { jobId: job.id, status: "succeeded", drill };
    } else {
      await runPrune(job, emit);
      return { jobId: job.id, status: "succeeded" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit("error", `Job failed: ${message}`);
    return { jobId: job.id, status: "failed", error: message };
  }
}

/** Run a job and forward events + result to the controller. */
export async function runJobForController(job: Job, cfg: AgentConfig): Promise<JobResult> {
  return executeJob(job, cfg.workDir, (e) => void sendEvent(cfg, e));
}
