import { loadConfig, type AgentConfig } from "./config.js";
import {
  setDockerBin,
  setHelperImage,
  dockerVersion,
  countContainers,
  detectCoolifyResourceUuids,
  listContainersForDiscovery,
  containerImageIds,
  recoverHeldContainers,
} from "./docker.js";
import { containerIdsByName, groupContainersByResource, PS_FORMAT, withImageIds } from "./hooks.js";
import { logger } from "./logger.js";
import { applyCbmSettings, getSettings, lockedByEnv } from "./settings.js";
import * as client from "./client.js";
import { runJobForController } from "./runner.js";
import { initHeldContainers } from "./held.js";
import { sweepOrphanedStages } from "./disk.js";
import { deliverResult, flushPendingResults, pendingResultIds } from "./outbox.js";
import { PollHealth, withQuickRetries } from "./poll-health.js";
import { describeHttpError } from "./http.js";
import { markHealthy, runAgentUpdate, selfInfo, updateInProgress } from "./self-update.js";
import { selfContainer } from "./restic-helper.js";
import type { JobResult } from "@cbm/shared";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jobs running in this process, reported with each heartbeat. */
const activeJobs = new Set<string>();
/** An agent update stops new jobs (draining), and must not start while a poll
 * may still bring one (polling). */
let draining = false;
let polling = false;
// Whether the controller answers polls: warns only past a few failures in a row.
const pollHealth = new PollHealth();

export async function startDaemon(): Promise<void> {
  const cfg = loadConfig();
  setDockerBin(cfg.dockerBin);
  // Helper containers run on the agent's own image (see setHelperImage).
  const self = await selfContainer();
  if (self) setHelperImage(self.image);

  logger.info(`Agent starting (host=${cfg.hostname}, controller=${cfg.controllerUrl})`);

  // Register if we don't have a token yet.
  if (!cfg.agentToken) {
    if (!cfg.enrollmentToken) {
      throw new Error("No AGENT_TOKEN and no ENROLLMENT_TOKEN - cannot register");
    }
    try {
      const res = await withRetry("register", () => client.register(cfg));
      cfg.agentToken = res.agentToken;
      logger.info(`Registered as agent ${res.agentId}`);
    } catch (e) {
      if (/\b401\b/.test((e as Error).message)) {
        logger.error(
          "Enrollment token was rejected (invalid or rotated). Reveal a NEW install command in the " +
            "controller UI and re-run it on this host to reconfigure the agent.",
        );
        process.exit(1);
      }
      throw e;
    }
  }

  // Containers a previous run left paused/stopped (crash, kill) are resumed now,
  // and on SIGTERM before exiting (see held.ts).
  initHeldContainers(cfg.workDir);
  await recoverHeldContainers((m) => logger.warn(m));
  await sweepOrphanedStages(cfg.workDir, (m) => logger.info(m));
  let stopping = false;
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      if (stopping) return;
      stopping = true;
      logger.info(`${sig} received - resuming any container paused or stopped by a running job, then exiting`);
      void recoverHeldContainers((m) => logger.warn(m)).finally(() => process.exit(0));
    });
  }

  // Results a previous run couldn't deliver.
  await flushPendingResults(cfg.workDir, (r) => client.sendResult(cfg, r), (m) => logger.info(m));

  // Background heartbeat.
  void heartbeatLoop(cfg);

  logger.info(`Polling for jobs (concurrency=${getSettings().concurrency})`);

  // Main loop: keep up to `concurrency` jobs running at once. Each finished job
  // posts its result independently, so a slow backup doesn't block the others.
  const inFlight = new Set<Promise<void>>();
  const startJob = (job: Awaited<ReturnType<typeof client.poll>>["job"]) => {
    if (!job) return;
    logger.info(`Picked up job ${job.id} (${job.type})`);
    activeJobs.add(job.id);
    const p = (async () => {
      const result = job.type === "update-agent" ? await updateSelf(job, cfg) : await runJobForController(job, cfg);
      await deliverResult(cfg.workDir, result, (r) => client.sendResult(cfg, r), { log: (m) => logger.warn(m) });
      logger.info(`Job ${job.id} finished: ${result.status}`);
    })()
      .catch((e) => logger.error(`job ${job.id} crashed: ${(e as Error).message}`))
      .finally(() => {
        inFlight.delete(p);
        activeJobs.delete(job.id);
      });
    inFlight.add(p);
  };

  for (;;) {
    // Fill free slots until the queue is empty or we're at capacity.
    // Read every round: the concurrency can change from CBM while running.
    while (!draining && inFlight.size < getSettings().concurrency) {
      let job = null;
      polling = true;
      try {
        // A blip (DNS, a reset connection) gets two quick retries before it counts.
        ({ job } = await withQuickRetries(() => client.poll(cfg), [1000, 3000], sleep));
        const back = pollHealth.succeeded();
        if (back) logger[back.level](back.message);
      } catch (e) {
        const log = pollHealth.failed(describeHttpError(e));
        logger[log.level](log.message);
        break;
      } finally {
        polling = false;
      }
      if (!job) break;
      startJob(job);
    }
    // After the fill loop the queue is empty or we're full. Either way, wait for
    // a job to finish (frees a slot) or a poll tick before polling again - never
    // spin. With nothing running, just sleep the poll interval.
    if (inFlight.size === 0) {
      await sleep(cfg.pollIntervalMs);
    } else {
      await Promise.race([Promise.race([...inFlight]), sleep(cfg.pollIntervalMs)]);
    }
  }
}

/** Container id -> image id: a container never changes image, so each is inspected once. */
const imageIds = new Map<string, string>();

/** Containers per resource, with the image each one runs (compared with a
 * snapshot's before an in-place restore). */
async function discoverContainers() {
  const ps = await listContainersForDiscovery(PS_FORMAT).catch(() => "");
  const groups = groupContainersByResource(ps);
  const ids = containerIdsByName(ps);
  const wanted = new Set(Object.values(groups).flatMap((list) => list.map((c) => ids.get(c.name) ?? "")));
  wanted.delete("");
  for (const id of imageIds.keys()) if (!wanted.has(id)) imageIds.delete(id);
  const missing = [...wanted].filter((id) => !imageIds.has(id));
  for (let i = 0; i < missing.length; i += 100) {
    for (const [id, image] of await containerImageIds(missing.slice(i, i + 100)).catch(() => new Map<string, string>()))
      imageIds.set(id, image);
  }
  return withImageIds(groups, ids, (id) => imageIds.get(id));
}

/** An update job: the agent replaces its own container (see self-update.ts). */
async function updateSelf(job: Extract<Awaited<ReturnType<typeof client.poll>>["job"], { type: "update-agent" }>, cfg: AgentConfig): Promise<JobResult> {
  const emit = async (level: "info" | "warn" | "error", message: string, progress?: number) => {
    logger[level](`[${job.id}] ${message}`);
    await client.sendEvent(cfg, { jobId: job.id, ts: new Date().toISOString(), level, message, progress });
  };
  try {
    return await runAgentUpdate(job, {
      workDir: cfg.workDir,
      hostname: cfg.hostname,
      version: client.AGENT_VERSION,
      emit,
      gate: {
        others: () => activeJobs.size - 1,
        polling: () => polling,
        drain: () => (draining = true),
        resume: () => (draining = false),
      },
      reregister: async () => {
        if (!cfg.enrollmentToken) return;
        try {
          cfg.agentToken = (await client.register(cfg)).agentToken;
        } catch (e) {
          if (/\b401\b/.test((e as Error).message))
            throw new Error("This host's install token was rotated since the agent was installed: re-run the install command to update it.");
          throw e;
        }
      },
    });
  } catch (e) {
    const message = (e as Error).message;
    await emit("error", `Job failed: ${message}`);
    return { jobId: job.id, status: "failed", error: message };
  }
}

async function heartbeatLoop(cfg: AgentConfig): Promise<void> {
  for (;;) {
    try {
      const self = await selfInfo();
      const updating = await updateInProgress(cfg.workDir);
      const answer = await client.heartbeat(cfg, {
        dockerVersion: await dockerVersion(),
        containers: await countContainers(),
        resourceUuids: await detectCoolifyResourceUuids().catch(() => []),
        // Containers per resource (one `docker ps`), for per-container hook targets.
        resourceContainers: await discoverContainers(),
        activeJobIds: [...activeJobs, ...(await pendingResultIds(cfg.workDir)), ...(updating ? [updating] : [])],
        settingsLockedByEnv: lockedByEnv(),
        settingsInEffect: getSettings(),
        agentVersion: client.AGENT_VERSION,
        agentImage: self.image,
        selfUpdate: self.status,
      });
      // An updater waiting for this (new) agent: it reached CBM.
      if (answer && updating) await markHealthy(cfg.workDir, client.AGENT_VERSION).catch(() => undefined);
      // Settings set in CBM apply from now on (env-fixed ones never change).
      if (answer?.settings) {
        const changed = applyCbmSettings(answer.settings);
        if (changed.length) {
          const s = getSettings();
          logger.info(`Settings from CBM: ${changed.map((k) => `${k}=${s[k]}`).join(", ")}`);
        }
      }
    } catch {
      /* ignore */
    }
    // Resend results kept while the controller was unreachable. (No periodic
    // container recovery here: it could unpause a container mid-backup freeze.)
    await flushPendingResults(cfg.workDir, (r) => client.sendResult(cfg, r), (m) => logger.info(m)).catch(() => undefined);
    await sleep(cfg.heartbeatIntervalMs);
  }
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 30): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // Auth failures aren't transient - don't burn retries on a bad token.
      if (/\b401\b/.test((e as Error).message)) throw e;
      logger.warn(`${label} attempt ${i + 1} failed: ${describeHttpError(e)}`);
      await sleep(2000);
    }
  }
  throw lastErr;
}
