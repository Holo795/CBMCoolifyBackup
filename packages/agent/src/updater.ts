/**
 * The agent updater: a short-lived container started by the agent from its
 * current image (see self-update.ts), with the agent's volumes. It swaps the
 * agent's container for one on the new image and puts the previous one back
 * when the new one doesn't reach CBM in time.
 *
 *   node packages/agent/dist/updater.js <plan.json>
 */
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { redactSecrets, type JobResult } from "@cbm/shared";
import { docker, setDockerBin } from "./docker.js";
import { keepResult } from "./outbox.js";
import { HEALTHY_TIMEOUT_MS, healthyPath, outcomePath, planPath, updateDir, type UpdatePlan } from "./self-update.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Docker Engine API over the local socket (the CLI can't create from a JSON body). */
export function dockerApi(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const host = process.env.DOCKER_HOST ?? "";
  const socketPath = host.startsWith("unix://") ? host.slice("unix://".length) : "/var/run/docker.sock";
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path, method, headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {} },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (text += c));
        res.on("end", () => {
          let json: Record<string, unknown> = {};
          try {
            json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
          } catch {
            json = { message: text };
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main(): Promise<void> {
  setDockerBin(process.env.DOCKER_BIN || "docker");
  const plan = JSON.parse(await readFile(process.argv[2], "utf8")) as UpdatePlan;
  const { workDir } = plan;
  const log = async (m: string) => {
    process.stdout.write(`${m}\n`);
    await appendFile(join(updateDir(workDir), "updater.log"), `${new Date().toISOString()} ${m}\n`).catch(() => undefined);
  };
  const nextName = `${plan.oldName}-next`;
  const prevName = `${plan.oldName}-previous`;
  const ok = async (args: string[]) => {
    const r = await docker(args);
    if (r.code !== 0) throw new Error(`docker ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(-300)}`);
    return r.stdout.trim();
  };

  // Before the agent is stopped, a failure is the agent's to report.
  const giveUp = async (error: string) => {
    await log(`giving up: ${error}`);
    await writeFile(outcomePath(workDir), JSON.stringify({ error }), { mode: 0o600 });
    process.exit(1);
  };

  await log(`updating ${plan.oldName} to ${plan.image}`);
  await docker(["rm", "-f", nextName]);
  let created: { status: number; json: Record<string, unknown> };
  try {
    created = await dockerApi("POST", `/containers/create?name=${encodeURIComponent(nextName)}`, plan.create);
  } catch (e) {
    return giveUp(`Could not reach Docker to create the new agent: ${(e as Error).message}`);
  }
  const newId = typeof created.json.Id === "string" ? created.json.Id : "";
  if (created.status >= 300 || !newId) return giveUp(`Docker refused to create the new agent: ${String(created.json.message ?? created.status)}`);

  const stop = await docker(["stop", "-t", "60", plan.oldId]);
  if (stop.code !== 0) {
    await docker(["rm", "-f", newId]);
    return giveUp(`Could not stop the running agent: ${(stop.stderr || stop.stdout).trim().slice(-300)}`);
  }

  // The agent is down from here: the outcome goes to the outbox, sent by
  // whichever agent runs next.
  const result = async (r: Omit<JobResult, "jobId">) => {
    await keepResult(workDir, { jobId: plan.jobId, ...r });
    await rm(planPath(workDir), { force: true });
    await rm(healthyPath(workDir), { force: true });
  };
  let renamed = false;
  let started = false;
  const rollback = async (why: string) => {
    await log(`rolling back: ${why}`);
    const logs = started ? await docker(["logs", "--tail", "15", newId]) : null;
    const lines = logs ? [...new Set(`${logs.stdout}\n${logs.stderr}`.split("\n").map((l) => l.trim()).filter(Boolean))] : [];
    const last = redactSecrets(lines.slice(-3).join(" | ")).slice(-500);
    await docker(["rm", "-f", newId]);
    if (renamed) await docker(["rename", plan.oldId, plan.oldName]);
    await result({
      status: "failed",
      error: `${why}: the previous agent (${plan.fromVersion}) was put back.${last ? ` Last lines of the new agent: ${last}` : ""}`,
    });
    const start = await docker(["start", plan.oldId]);
    if (start.code !== 0) await log(`could not restart the previous agent: ${start.stderr.trim()}`);
  };

  try {
    // A previous container left by an interrupted update.
    const stale = await docker(["inspect", "--format", "{{.State.Running}}", prevName]);
    if (stale.code === 0 && stale.stdout.trim() !== "true") await docker(["rm", "-f", prevName]);
    await ok(["rename", plan.oldId, prevName]);
    renamed = true;
    await ok(["rename", newId, plan.oldName]);
    for (const n of plan.networks) {
      const args = ["network", "connect", ...n.aliases.flatMap((a) => ["--alias", a])];
      if (n.ipv4) args.push("--ip", n.ipv4);
      if (n.ipv6) args.push("--ip6", n.ipv6);
      await ok([...args, n.name, newId]);
    }
    await ok(["start", newId]);
    started = true;
  } catch (e) {
    await rollback(`The new agent could not be started (${(e as Error).message})`);
    return;
  }

  try {
    await log("new agent started, waiting for it to reach CBM");
    const deadline = Date.now() + HEALTHY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(3000);
      const healthy = await readFile(healthyPath(workDir), "utf8")
        .then((s) => JSON.parse(s) as { id?: string; version?: string })
        .catch(() => null);
      if (healthy?.id === newId) {
        await docker(["rm", "-f", plan.oldId]);
        await result({ status: "succeeded", update: { from: plan.fromVersion, to: healthy.version ?? "?" } });
        await log(`done: ${plan.fromVersion} -> ${healthy.version}`);
        return;
      }
    }
  } catch (e) {
    await rollback(`The update stopped unexpectedly (${(e as Error).message})`);
    return;
  }
  await rollback(`The new agent (${plan.image}) did not reach CBM within ${Math.round(HEALTHY_TIMEOUT_MS / 60_000)} min`);
}

main().catch(async (e) => {
  process.stderr.write(`updater: ${(e as Error).message}\n`);
  process.exit(1);
});
