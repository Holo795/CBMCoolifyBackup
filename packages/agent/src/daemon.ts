import { loadConfig, type AgentConfig } from "./config.js";
import { setDockerBin, dockerVersion, countContainers, detectCoolifyResourceUuids } from "./docker.js";
import { logger } from "./logger.js";
import * as client from "./client.js";
import { runJobForController } from "./runner.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startDaemon(): Promise<void> {
  const cfg = loadConfig();
  setDockerBin(cfg.dockerBin);

  logger.info(`Agent starting (host=${cfg.hostname}, controller=${cfg.controllerUrl})`);

  // Register if we don't have a token yet.
  if (!cfg.agentToken) {
    if (!cfg.enrollmentToken) {
      throw new Error("No AGENT_TOKEN and no ENROLLMENT_TOKEN — cannot register");
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

  // Background heartbeat.
  void heartbeatLoop(cfg);

  // Main poll loop.
  for (;;) {
    try {
      const { job } = await client.poll(cfg);
      if (job) {
        logger.info(`Picked up job ${job.id} (${job.type})`);
        const result = await runJobForController(job, cfg);
        await client.sendResult(cfg, result).catch((e) => logger.error(`send result failed`, e));
        logger.info(`Job ${job.id} finished: ${result.status}`);
        continue; // poll again immediately
      }
    } catch (e) {
      logger.warn(`poll error: ${(e as Error).message}`);
    }
    await sleep(cfg.pollIntervalMs);
  }
}

async function heartbeatLoop(cfg: AgentConfig): Promise<void> {
  for (;;) {
    try {
      await client.heartbeat(cfg, {
        dockerVersion: await dockerVersion(),
        containers: await countContainers(),
        resourceUuids: await detectCoolifyResourceUuids().catch(() => []),
      });
    } catch {
      /* ignore */
    }
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
      // Auth failures aren't transient — don't burn retries on a bad token.
      if (/\b401\b/.test((e as Error).message)) throw e;
      logger.warn(`${label} attempt ${i + 1} failed: ${(e as Error).message}`);
      await sleep(2000);
    }
  }
  throw lastErr;
}
