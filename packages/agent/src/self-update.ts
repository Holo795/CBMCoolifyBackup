import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { imageRepo, redactSecrets, type JobResult, type SelfUpdateStatus, type UpdateAgentJob } from "@cbm/shared";
import { docker, inspectContainer, inspectImage, type DockerInspect } from "./docker.js";
import { hostPathOf, selfContainer } from "./restic-helper.js";

/*
 * Updating the agent from CBM. A process can't replace its own container (it
 * dies on the way), so the agent prepares a plan - the container to create,
 * read from its own (settings, volumes, networks) with the new image - and
 * hands it to a short-lived updater container (updater.ts) started from its
 * current image. The updater creates the new container, stops the agent,
 * swaps the names, starts the new one and waits for it to report to CBM; if it
 * doesn't, it puts the previous container back. The outcome is left in the
 * outbox for whichever agent runs next to send.
 */

export const UPDATER_NAME = "cbm-agent-updater";
/** How long the new agent has to reach CBM before the previous one is put back. */
export const HEALTHY_TIMEOUT_MS = 2 * 60_000;
/** How long an update waits for the agent's other jobs to finish. */
const IDLE_TIMEOUT_MS = 6 * 3600_000;

export const updateDir = (workDir: string) => join(workDir, "agent-update");
export const planPath = (workDir: string) => join(updateDir(workDir), "plan.json");
export const outcomePath = (workDir: string) => join(updateDir(workDir), "outcome.json");
export const healthyPath = (workDir: string) => join(updateDir(workDir), "healthy.json");

export type UpdatePlan = {
  jobId: string;
  workDir: string;
  /** The running agent's container. */
  oldId: string;
  oldName: string;
  image: string;
  fromVersion: string;
  /** Docker Engine API body for the new container (POST /containers/create). */
  create: Record<string, unknown>;
  /** Networks to connect after create (the API takes one at creation). */
  networks: Array<{ name: string; aliases: string[]; ipv4?: string; ipv6?: string }>;
};

/** What the updater reports when it gives up before stopping the agent. */
export type UpdateOutcome = { error: string };

type SelfInfo = { status: SelfUpdateStatus; image?: string; id?: string; imageId?: string };
let selfInfoP: Promise<SelfInfo> | null = null;

/** Whether this agent can replace its own container, and the image it runs. */
export function selfInfo(): Promise<SelfInfo> {
  selfInfoP ??= (async (): Promise<SelfInfo> => {
    const self = await selfContainer();
    if (!self) return { status: "native" };
    const c = await inspectContainer(self.id);
    const image = typeof c?.Config?.Image === "string" ? c.Config.Image : undefined;
    const labels = (c?.Config?.Labels ?? {}) as Record<string, string>;
    const status = labels["com.docker.compose.project"] ? "compose" : "ok";
    return { status, image, id: self.id, imageId: self.image };
  })().catch(() => ({ status: "native" as const }));
  return selfInfoP;
}

type Endpoint = { Aliases?: string[] | null; IPAMConfig?: { IPv4Address?: string; IPv6Address?: string } | null; Links?: string[] | null };

/**
 * The Engine API body that recreates container `c` on `newImage`: its host
 * config as is (mounts, restart policy, DNS, logging, limits...), and what it
 * set over its image - environment, labels, command, user - so the new image's
 * own defaults (PATH, Node version...) apply. `keepEnv` is added when missing.
 */
export function recreateSpec(
  c: DockerInspect,
  img: DockerInspect,
  newImage: string,
  keepEnv: Record<string, string> = {},
): { create: Record<string, unknown>; networks: UpdatePlan["networks"] } {
  const cfg = (c.Config ?? {}) as Record<string, unknown>;
  const imgCfg = (img.Config ?? {}) as Record<string, unknown>;
  const id = typeof c.Id === "string" ? c.Id : "";

  const imageEnv = new Set((imgCfg.Env as string[] | undefined) ?? []);
  const env = ((cfg.Env as string[] | undefined) ?? []).filter((e) => !imageEnv.has(e));
  for (const [k, v] of Object.entries(keepEnv)) if (!env.some((e) => e.startsWith(`${k}=`))) env.push(`${k}=${v}`);
  const imageLabels = (imgCfg.Labels as Record<string, string> | undefined) ?? {};
  const labels = Object.fromEntries(
    Object.entries((cfg.Labels as Record<string, string> | undefined) ?? {}).filter(([k, v]) => imageLabels[k] !== v),
  );

  const create: Record<string, unknown> = { Image: newImage, Env: env, Labels: labels, HostConfig: c.HostConfig ?? {} };
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const k of ["Cmd", "Entrypoint", "WorkingDir", "User"]) if (!same(cfg[k], imgCfg[k])) create[k] = cfg[k];
  // Docker's default hostname is the container's short id: only a chosen one is kept.
  if (typeof cfg.Hostname === "string" && cfg.Hostname && !id.startsWith(cfg.Hostname)) create.Hostname = cfg.Hostname;

  const hostCfg = (c.HostConfig ?? {}) as { NetworkMode?: string };
  const mode = hostCfg.NetworkMode || "default";
  const nets = Object.entries(((c.NetworkSettings as { Networks?: Record<string, Endpoint> } | undefined)?.Networks ?? {}) as Record<string, Endpoint>);
  // An alias that is the old container's short id would name the wrong container.
  const aliases = (e: Endpoint) => (e.Aliases ?? []).filter((a) => !id.startsWith(a));
  let primary: string | undefined;
  if (!/^(host|none|container:)/.test(mode)) {
    primary = mode === "default" ? "bridge" : mode;
    const p = nets.find(([name]) => name === primary);
    if (p) {
      const e = p[1];
      create.NetworkingConfig = {
        EndpointsConfig: {
          [primary]: {
            ...(aliases(e).length ? { Aliases: aliases(e) } : {}),
            ...(e.IPAMConfig ? { IPAMConfig: e.IPAMConfig } : {}),
            ...(e.Links?.length ? { Links: e.Links } : {}),
          },
        },
      };
    }
  }
  const networks = nets
    .filter(([name]) => name !== primary)
    .map(([name, e]) => ({
      name,
      aliases: aliases(e),
      ...(e.IPAMConfig?.IPv4Address ? { ipv4: e.IPAMConfig.IPv4Address } : {}),
      ...(e.IPAMConfig?.IPv6Address ? { ipv6: e.IPAMConfig.IPv6Address } : {}),
    }));
  return { create, networks };
}

/** The job id of an update in progress (reported as active until its result is sent). */
export async function updateInProgress(workDir: string): Promise<string | undefined> {
  try {
    return (JSON.parse(await readFile(planPath(workDir), "utf8")) as UpdatePlan).jobId;
  } catch {
    return undefined;
  }
}

/** After a heartbeat CBM answered: tell a waiting updater this agent is up. */
export async function markHealthy(workDir: string, version: string): Promise<void> {
  if (!(await stat(planPath(workDir)).catch(() => null))) return;
  const self = await selfContainer();
  if (!self) return;
  await writeFile(healthyPath(workDir), JSON.stringify({ id: self.id, version }), { mode: 0o600 });
}

/** How the daemon lets an update wait for the other jobs, then stop taking new ones. */
export interface UpdateGate {
  /** Jobs running besides the update. */
  others(): number;
  /** A poll for a new job is under way (its job would start after the check). */
  polling(): boolean;
  drain(): void;
  resume(): void;
}

export type UpdateDeps = {
  workDir: string;
  hostname: string;
  version: string;
  gate: UpdateGate;
  /** Resolves once the event reached CBM (or failed to): the agent's token
   * changes when it registers again, and it stops right after the handover. */
  emit: (level: "info" | "warn" | "error", message: string, progress?: number) => Promise<void>;
  /** Register again with the install token (a rotated one fails here, before anything changes). */
  reregister: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Run an update job. Resolves with a result when it ends in this process
 * (nothing to do, or a failure before the swap); once the updater stops this
 * agent it never resolves - the updater leaves the result in the outbox.
 */
export async function runAgentUpdate(job: UpdateAgentJob, deps: UpdateDeps): Promise<JobResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const info = await selfInfo();
  if (info.status === "native") throw new Error("This agent doesn't run in a container: update it where it runs.");
  if (info.status === "compose")
    throw new Error("This agent's container is managed by docker compose (or Coolify): update it there (pull, then up -d).");
  if (!info.id || !info.imageId || !info.image) throw new Error("Could not inspect the agent's own container.");
  if (imageRepo(job.image) !== imageRepo(info.image))
    throw new Error(`Refusing ${job.image}: this agent runs from ${imageRepo(info.image)}, it only updates from that repository.`);
  // The updater reads the plan from the work dir it shares with the agent.
  await hostPathOf(deps.workDir).catch(() => {
    throw new Error(`The work dir ${deps.workDir} is not on a volume: the updater couldn't read the plan. Re-run the install command.`);
  });

  // Wait for the other jobs, then take no new one.
  const started = Date.now();
  let told = -1;
  for (;;) {
    const others = deps.gate.others();
    if (others === 0 && !deps.gate.polling()) {
      deps.gate.drain();
      break;
    }
    if (others !== told && others > 0) {
      await deps.emit("info", `Waiting for ${others} running job(s) to finish before updating`);
      told = others;
    }
    if (Date.now() - started > IDLE_TIMEOUT_MS) throw new Error("The agent never stopped running jobs for 6 hours: update not done.");
    await sleep(5000);
  }

  try {
    await deps.emit("info", `Pulling ${job.image}`, 10);
    const pull = await docker(["pull", job.image]);
    if (pull.code !== 0) throw new Error(`Could not pull ${job.image}: ${redactSecrets((pull.stderr || pull.stdout).trim().slice(-400))}`);
    const next = await inspectImage(job.image);
    if (!next?.Id) throw new Error(`${job.image} was pulled but can't be inspected`);
    if (next.Id === info.imageId) {
      await deps.emit("info", `Already running ${job.image}: nothing to update`, 100);
      deps.gate.resume();
      return { jobId: job.id, status: "succeeded", update: { from: deps.version, to: deps.version } };
    }

    await deps.reregister();

    const container = await inspectContainer(info.id);
    const oldImage = await inspectImage(info.imageId);
    if (!container || !oldImage) throw new Error("Could not inspect the agent's own container.");
    const name = String(container.Name ?? "").replace(/^\//, "");
    if (!name) throw new Error("The agent's container has no name.");
    const { create, networks } = recreateSpec(container, oldImage, job.image, { AGENT_HOSTNAME: deps.hostname });
    const plan: UpdatePlan = {
      jobId: job.id,
      workDir: deps.workDir,
      oldId: info.id,
      oldName: name,
      image: job.image,
      fromVersion: deps.version,
      create,
      networks,
    };

    const running = await docker(["inspect", "--format", "{{.State.Running}}", UPDATER_NAME]);
    if (running.code === 0 && running.stdout.trim() === "true") throw new Error("Another agent update is already running on this host.");
    await docker(["rm", "-f", UPDATER_NAME]);
    await mkdir(updateDir(deps.workDir), { recursive: true });
    await rm(outcomePath(deps.workDir), { force: true });
    await rm(healthyPath(deps.workDir), { force: true });
    await writeFile(planPath(deps.workDir), JSON.stringify(plan), { mode: 0o600 });

    await deps.emit("info", `Handing over to the updater: this agent stops, ${job.image} starts`, 40);
    const run = await docker([
      "run",
      "-d",
      "--rm",
      "--name",
      UPDATER_NAME,
      "--network",
      "none",
      "--label",
      "cbm.agent-updater=1",
      "--volumes-from",
      info.id,
      "--entrypoint",
      "node",
      info.imageId,
      "packages/agent/dist/updater.js",
      planPath(deps.workDir),
    ]);
    if (run.code !== 0) {
      await rm(planPath(deps.workDir), { force: true });
      throw new Error(`Could not start the updater: ${(run.stderr || run.stdout).trim().slice(-400)}`);
    }
    // The updater stops this process. Still here when it exits: it gave up first.
    await docker(["wait", UPDATER_NAME]);
    const outcome = await readFile(outcomePath(deps.workDir), "utf8")
      .then((s) => JSON.parse(s) as UpdateOutcome)
      .catch(() => null);
    await rm(planPath(deps.workDir), { force: true });
    throw new Error(outcome?.error ?? "The updater stopped without replacing the agent.");
  } catch (e) {
    deps.gate.resume();
    throw e;
  }
}
