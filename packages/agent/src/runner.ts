import { redactSecrets, type Job, type JobResult, type JobEvent } from "@cbm/shared";
import type { AgentConfig } from "./config.js";
import { runBackup, type Emit } from "./backup.js";
import { runRestore } from "./restore.js";
import { runPrune } from "./prune.js";
import { runVerifyDestination } from "./verify.js";
import { runMirror } from "./mirror.js";
import { runRestoreDrill } from "./drill.js";
import { logger } from "./logger.js";
import { isDiskFull } from "./disk.js";
import { sendEvent } from "./client.js";
import { isTransientFailure } from "./outcome.js";

/** Wait before trying a backup again after a transient failure. */
export const BACKUP_RETRY_DELAY_MS = 30_000;

/**
 * Execute a job, streaming events. `onEvent` receives every event (used to
 * forward to the controller). Returns the final JobResult.
 */
export async function executeJob(
  job: Job,
  workDir: string,
  onEvent?: (e: JobEvent) => void,
): Promise<JobResult> {
  const emit: Emit = (level, rawMessage, progress) => {
    // Nothing secret may reach job logs (visible to every role) or alerts.
    const message = redactSecrets(rawMessage);
    const e: JobEvent = { jobId: job.id, ts: new Date().toISOString(), level, message, progress };
    logger[level](`[${job.id}] ${message}`);
    onEvent?.(e);
  };

  try {
    if (job.type === "backup") {
      const result = await backupWithRetry(() => runBackup(job, workDir, emit), emit);
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
    } else if (job.type === "update-agent") {
      throw new Error("An agent update runs in the agent daemon only");
    } else if (job.type === "restore-drill") {
      // The job itself succeeds when the drill ran; the verdict is in `drill`.
      const drill = await runRestoreDrill(job, workDir, emit);
      return { jobId: job.id, status: "succeeded", drill };
    } else {
      await runPrune(job, emit);
      return { jobId: job.id, status: "succeeded" };
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const message = redactSecrets(isDiskFull(err) ? `Disk full on the agent host (${workDir}): ${raw}` : raw);
    emit("error", `Job failed: ${message}`);
    return { jobId: job.id, status: "failed", error: message };
  }
}

/** Run a job and forward events + result to the controller. */
export async function runJobForController(job: Job, cfg: AgentConfig): Promise<JobResult> {
  return executeJob(job, cfg.workDir, (e) => void sendEvent(cfg, e));
}

/**
 * Run a backup, and once more after a short wait when it failed for a
 * transient reason (see isTransientFailure): a DNS or Docker hiccup at the
 * start of the nightly run shouldn't cost a night's backup and an alert. A
 * failed run cleans up after itself (staging, restic parts, post hooks), so the
 * second one starts from scratch.
 */
export async function backupWithRetry<T>(
  run: () => Promise<T>,
  emit: Emit,
  delayMs = BACKUP_RETRY_DELAY_MS,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!isTransientFailure(message)) throw e;
    emit("warn", `Failed for a passing reason (${message.split("\n")[0].slice(0, 300)}): trying again in ${Math.round(delayMs / 1000)} s`);
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      return await run();
    } catch (e2) {
      const again = e2 instanceof Error ? e2.message : String(e2);
      const first = message.split("\n")[0].slice(0, 200);
      throw new Error(again === message ? `${again} (failed again ${Math.round(delayMs / 1000)} s later)` : `${again} (second attempt; the first failed with: ${first})`);
    }
  }
}
