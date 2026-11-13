import { loadConfig, type AgentConfig } from "./config.js";
import {
  setDockerBin,
  setHelperImage,
  jobScope,
  stopJobContainers,
  sweepJobContainers,
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
import { loadAgentToken, saveAgentToken } from "./identity.js";
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

  // Containers a previous run left paused/stopped (crash, kill) are resumed
  // first - before anything that needs the controller, which may be down in
  // the same incident - and on SIGTERM before exiting (see held.ts).
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

  // Its own credential: AGENT_TOKEN, else the one kept from its enrollment,
  // else enroll now with the install token (see identity.ts).
  if (!cfg.agentToken) cfg.agentToken = (await loadAgentToken(cfg.workDir, cfg.controllerUrl)) ?? "";
  if (!cfg.agentToken) {
    if (!cfg.enrollmentToken) {
      throw new Error("No AGENT_TOKEN and no ENROLLMENT_TOKEN - cannot register");
    }
    try {
      await enroll(cfg);
    } catch (e) {
      if (/\b401\b/.test((e as Error).message)) {
        logger.error(
          "The install token was rejected (already used, expired or rotated). Reveal a NEW install command in the " +
            "controller UI and re-run it on this host.",
        );
        process.exit(1);
      }
      throw e;
    }
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
      // The updater outlives this process: it isn't the job's to stop or sweep.
      const result =
        job.type === "update-agent" ? await updateSelf(job, cfg) : await jobScope.run(job.id, () => runJobForController(job, cfg));
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
      // The new container reads the credential kept in the shared work dir.
      reregister: () => saveAgentToken(cfg.workDir, cfg.controllerUrl, cfg.agentToken),
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
      // Jobs the controller gave up on (time limit, agent lost): stop what they
      // started, so they release the repository locks they hold.
      for (const id of answer?.cancel ?? []) {
        if (!activeJobs.has(id)) continue;
        const n = await stopJobContainers(id).catch(() => 0);
        logger.warn(`Job ${id} was given up by the controller: stopped ${n} of its container(s)`);
      }
      // Containers of jobs this process doesn't run (it restarted mid-job).
      const swept = await sweepJobContainers(activeJobs).catch(() => [] as string[]);
      if (swept.length) logger.info(`Removed containers left by job(s) no longer running: ${swept.join(", ")}`);
      // Settings set in CBM apply from now on (env-fixed ones never change).
      if (answer?.settings) {
        const changed = applyCbmSettings(answer.settings);
        if (changed.length) {
          const s = getSettings();
          logger.info(`Settings from CBM: ${changed.map((k) => `${k}=${s[k]}`).join(", ")}`);
        }
      }
    } catch (e) {
      // Its credential refused (the agent was removed from CBM): enroll again
      // if the install token still works, at most every 10 minutes.
      if (/\b401\b/.test((e as Error).message)) await reenroll(cfg);
    }
    // Resend results kept while the controller was unreachable. (No periodic
    // container recovery here: it could unpause a container mid-backup freeze.)
    await flushPendingResults(cfg.workDir, (r) => client.sendResult(cfg, r), (m) => logger.info(m)).catch(() => undefined);
    await sleep(cfg.heartbeatIntervalMs);
  }
}

/** Enroll with the install token and keep the credential it gives. */
async function enroll(cfg: AgentConfig): Promise<void> {
  const res = await withRetry("register", () => client.register(cfg));
  cfg.agentToken = res.agentToken;
  await saveAgentToken(cfg.workDir, cfg.controllerUrl, res.agentToken).catch((e) =>
    logger.warn(`Could not keep the agent's credential in ${cfg.workDir} (${(e as Error).message}): it will enroll again at its next start`),
  );
  logger.info(`Registered as agent ${res.agentId}`);
}

let lastReenroll = 0;
async function reenroll(cfg: AgentConfig): Promise<void> {
  if (Date.now() - lastReenroll < 10 * 60_000) return;
  lastReenroll = Date.now();
  if (!cfg.enrollmentToken) {
    logger.error("The controller refused this agent's credential and there's no install token to enroll again: re-run the install command.");
    return;
  }
  await enroll(cfg).catch((e) =>
    logger.error(
      `The controller refused this agent's credential, and enrolling again failed (${describeHttpError(e)}): re-run the install command.`,
    ),
  );
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
