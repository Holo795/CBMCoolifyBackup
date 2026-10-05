import { spawn } from "node:child_process";
import { createWriteStream, createReadStream } from "node:fs";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { redactSecrets } from "@cbm/shared";
import { runCapture, type RunResult } from "./proc.js";
import { holdContainer, releaseContainer, heldContainers } from "./held.js";

let DOCKER = "docker";
export function setDockerBin(bin: string) {
  DOCKER = bin;
}

export type { RunResult };

/**
 * Secrets never go in docker's arguments (visible in `ps`, and echoed in error
 * messages that end up in job logs and alerts). Pass `-e NAME` without a value
 * in the arguments and the value here: docker copies it from its own environment.
 */
export type SecretEnv = Record<string, string>;

const childEnv = (secrets?: SecretEnv) => (secrets ? { ...process.env, ...secrets } : undefined);

/** A short, redacted description of a docker command for error messages. */
function describe(args: string[]): string {
  return redactSecrets(args.slice(0, 6).join(" ") + (args.length > 6 ? " …" : ""));
}

/** Run a docker command, buffering stdout/stderr as strings. */
export function docker(args: string[], secrets?: SecretEnv): Promise<RunResult> {
  return runCapture(DOCKER, args, { env: childEnv(secrets) });
}

/** Run a docker command and stream stdout into a file (for dumps). */
export async function dockerToFile(args: string[], outFile: string, secrets?: SecretEnv): Promise<void> {
  const out = createWriteStream(outFile);
  const child = spawn(DOCKER, args, { stdio: ["ignore", "pipe", "pipe"], env: childEnv(secrets) });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  // Capture the exit code independently, then await the write completing.
  // (Using `once(out,"close")` after the child exits races: for tiny outputs
  // the stream closes first and we'd await an event that already fired.)
  const exit = once(child, "close") as Promise<[number]>;
  await pipeline(child.stdout, out);
  const [code] = await exit;
  if (code !== 0) {
    throw new Error(`docker ${describe(args)} exited ${code}: ${redactSecrets(stderr.slice(0, 2000))}`);
  }
}

/** Run a docker command feeding a file into stdin (for restores). */
export async function dockerFromFile(args: string[], inFile: string, secrets?: SecretEnv): Promise<void> {
  const child = spawn(DOCKER, args, { stdio: ["pipe", "pipe", "pipe"], env: childEnv(secrets) });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  child.stdout.on("data", () => {}); // drain so a full pipe can't block the child
  // Capture the exit code independently of the stdin write. If the child closes
  // its stdin early (e.g. it rejected the input) the write side gets EPIPE - we
  // swallow it so the authoritative error stays the exit code + buffered stderr.
  const exit = once(child, "close") as Promise<[number]>;
  await pipeline(createReadStream(inFile), child.stdin).catch(() => undefined);
  const [code] = await exit;
  if (code !== 0) {
    throw new Error(`docker ${describe(args)} exited ${code}: ${redactSecrets(stderr.slice(0, 2000))}`);
  }
}

/** The subset of `docker inspect` JSON the agent reads (the rest stays dynamic). */
export interface DockerInspect {
  Id?: string;
  Image?: string;
  RepoDigests?: string[];
  Config?: { Image?: string; Labels?: Record<string, string>; Env?: string[] };
  Mounts?: Array<{ Type?: string; Source?: string; Name?: string; RW?: boolean }>;
  [k: string]: unknown;
}

export async function inspectContainer(name: string): Promise<DockerInspect | null> {
  const r = await docker(["inspect", name]);
  if (r.code !== 0) return null;
  try {
    const arr = JSON.parse(r.stdout);
    return arr[0] ?? null;
  } catch {
    return null;
  }
}

export async function inspectImage(image: string): Promise<DockerInspect | null> {
  const r = await docker(["image", "inspect", image]);
  if (r.code !== 0) return null;
  try {
    const arr = JSON.parse(r.stdout);
    return arr[0] ?? null;
  } catch {
    return null;
  }
}

export async function containerExists(name: string): Promise<boolean> {
  const r = await docker(["inspect", "-f", "{{.Id}}", name]);
  return r.code === 0;
}

export async function isContainerRunning(name: string): Promise<boolean> {
  const r = await docker(["inspect", "-f", "{{.State.Running}}", name]);
  return r.code === 0 && r.stdout.trim() === "true";
}

export async function stopContainer(name: string): Promise<void> {
  holdContainer(name, "stopped"); // before: a kill right after must still restart it
  const r = await docker(["stop", name]);
  if (r.code !== 0) {
    releaseContainer(name);
    throw new Error(`docker stop ${name} failed: ${r.stderr}`);
  }
}

export async function startContainer(name: string): Promise<void> {
  const r = await docker(["start", name]);
  if (r.code !== 0) throw new Error(`docker start ${name} failed: ${r.stderr}`);
  releaseContainer(name);
}

/** Freeze a container's processes in place (no restart, state preserved). */
export async function pauseContainer(name: string): Promise<void> {
  holdContainer(name, "paused"); // before: a kill right after must still resume it
  const r = await docker(["pause", name]);
  if (r.code !== 0) {
    releaseContainer(name);
    throw new Error(`docker pause ${name} failed: ${r.stderr}`);
  }
}

/** Resume a previously frozen container. */
export async function unpauseContainer(name: string): Promise<void> {
  const r = await docker(["unpause", name]);
  // "is not paused" means it's already running: nothing left to undo.
  if (r.code !== 0 && !/not paused/i.test(r.stderr)) throw new Error(`docker unpause ${name} failed: ${r.stderr}`);
  releaseContainer(name);
}

/**
 * Resume every container the agent left paused or stopped (see held.ts): on
 * startup after a crash, and on SIGTERM. A container that no longer exists is
 * forgotten; one that can't be resumed stays recorded for the next attempt.
 */
export async function recoverHeldContainers(log: (msg: string) => void): Promise<void> {
  for (const h of heldContainers()) {
    if (!(await containerExists(h.name))) {
      releaseContainer(h.name);
      continue;
    }
    try {
      if (h.action === "paused") await unpauseContainer(h.name);
      else await startContainer(h.name);
      log(`Resumed ${h.name} (left ${h.action} by an interrupted job since ${h.since})`);
    } catch (e) {
      log(`Could not resume ${h.name}: ${(e as Error).message} - will retry`);
    }
  }
}

/**
 * Running containers that mount `volume` read-write - i.e. the ones that could
 * be writing to it, so they need a brief freeze for a consistent copy. A volume
 * mounted read-only (or by no running container) needs no freeze.
 */
export async function runningRwContainersForVolume(volume: string): Promise<string[]> {
  const r = await docker(["ps", "--filter", `volume=${volume}`, "--format", "{{.Names}}"]);
  if (r.code !== 0) return [];
  const names = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const name of names) {
    const info = await inspectContainer(name);
    const mounts: Array<{ Name?: string; Source?: string; RW?: boolean }> = info?.Mounts ?? [];
    const m = mounts.find((x) => x?.Name === volume || x?.Source?.endsWith(`/volumes/${volume}/_data`));
    // RW === false means read-only; anything else is treated as writable.
    if (!m || m.RW !== false) out.push(name);
  }
  return out;
}

/** Tar a docker volume into a tarball on the host using a throwaway helper. */
export async function tarVolume(volume: string, outFile: string): Promise<void> {
  // Stream the tar of the volume contents to stdout, then into outFile.
  await dockerToFile(
    [
      "run",
      "--rm",
      "-v",
      `${volume}:/data:ro`,
      "alpine:3.24",
      "tar",
      "-cf",
      "-",
      "-C",
      "/data",
      ".",
    ],
    outFile,
  );
}

/** Restore a tarball into a docker volume (creates it if missing). */
export async function restoreVolume(volume: string, inFile: string): Promise<void> {
  await docker(["volume", "create", volume]);
  await dockerFromFile(
    [
      "run",
      "--rm",
      "-i",
      "-v",
      `${volume}:/data`,
      "alpine:3.24",
      "sh",
      "-c",
      "rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar -xf - -C /data",
    ],
    inFile,
  );
}

/**
 * Write a single file into a docker volume (creating it if missing). Used to
 * place a Redis RDB snapshot (`dump.rdb`) into the data volume before the
 * container loads it. `destName` must be a plain filename (no path traversal).
 */
export async function writeFileIntoVolume(volume: string, destName: string, inFile: string): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(destName)) throw new Error(`Unsafe volume file name: ${destName}`);
  await docker(["volume", "create", volume]);
  await dockerFromFile(
    ["run", "--rm", "-i", "-v", `${volume}:/data`, "alpine:3.24", "sh", "-c", `cat > /data/${destName}`],
    inFile,
  );
}

// Coolify runs Redis with --appendonly yes, and with AOF on a server ignores
// dump.rdb at startup: the snapshot must also be its AOF. Redis/Valkey >= 7 take
// a multi-part AOF whose base is an RDB; older ones an appendonly.aof starting
// with the RDB (the RDB preamble). Without AOF, dump.rdb is what's read.
const RDB_PLACE_SCRIPT =
  "set -e; cat > /data/dump.rdb; rm -rf /data/appendonlydir /data/appendonly.aof; " +
  "cp /data/dump.rdb /data/appendonly.aof; mkdir /data/appendonlydir; " +
  "cp /data/dump.rdb /data/appendonlydir/appendonly.aof.1.base.rdb; : > /data/appendonlydir/appendonly.aof.1.incr.aof; " +
  "printf 'file appendonly.aof.1.base.rdb seq 1 type b\\nfile appendonly.aof.1.incr.aof seq 1 type i\\n' " +
  "> /data/appendonlydir/appendonly.aof.manifest";

/** Put a Redis-family RDB snapshot in a data volume so the server loads it at
 * its next start, whatever its persistence mode. */
export async function restoreRdbIntoVolume(volume: string, inFile: string): Promise<void> {
  // Snapshots taken before 2.1 may still carry redis-cli's replication EOF mark.
  const { stripRdbEofMark } = await import("./dump.js");
  await stripRdbEofMark(inFile);
  await docker(["volume", "create", volume]);
  await dockerFromFile(["run", "--rm", "-i", "-v", `${volume}:/data`, "alpine:3.24", "sh", "-c", RDB_PLACE_SCRIPT], inFile);
}

/** Restore a tarball into a host directory (a bind-mount source). */
export async function restoreToPath(hostPath: string, inFile: string): Promise<void> {
  await dockerFromFile(
    [
      "run",
      "--rm",
      "-i",
      "-v",
      `${hostPath}:/data`,
      "alpine:3.24",
      "sh",
      "-c",
      "rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar -xf - -C /data",
    ],
    inFile,
  );
}

/**
 * Verify a tarball opens (lists without error) by streaming it through a
 * throwaway container - no host-path access needed. Throws if it's corrupt.
 */
export async function verifyTarOpens(inFile: string): Promise<void> {
  await dockerFromFile(["run", "--rm", "-i", "alpine:3.24", "tar", "-tf", "-"], inFile);
}

/**
 * Read a whole tarball through a throwaway, network-less container and return
 * how many entries it lists. Throws (non-zero exit) if any part is unreadable,
 * so a successful count proves the archive restores end to end.
 */
export async function tarEntryCount(inFile: string): Promise<number> {
  const child = spawn(
    DOCKER,
    // pipefail (supported by busybox ash) so a tar read error fails the pipeline.
    ["run", "--rm", "-i", "--network", "none", "alpine:3.24", "sh", "-c", "set -o pipefail; tar -tf - | wc -l"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));
  const exit = once(child, "close") as Promise<[number]>;
  await pipeline(createReadStream(inFile), child.stdin).catch(() => undefined);
  const [code] = await exit;
  if (code !== 0) {
    throw new Error(`archive is not fully readable: ${stderr.trim().slice(0, 500) || `exit ${code}`}`);
  }
  const n = Number.parseInt(stdout.trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`could not count archive entries (got "${stdout.trim()}")`);
  return n;
}

/**
 * Run a shell command inside a container (used for pre/post-backup hooks).
 * With `timeoutSec`, the container's own `timeout` stops the command when the
 * image has one; the client-side limit is a backstop (it ends the wait, but the
 * command may keep running in an image without `timeout`). The command and the
 * limit are passed as positional parameters, never spliced into the script.
 */
export async function execShell(container: string, command: string, timeoutSec?: number): Promise<RunResult> {
  if (!timeoutSec) return docker(["exec", container, "sh", "-c", command]);
  const script = 'if command -v timeout >/dev/null 2>&1; then exec timeout -s TERM "$1" sh -c "$2"; else exec sh -c "$2"; fi';
  return runCapture(DOCKER, ["exec", container, "sh", "-c", script, "cbm-hook", String(timeoutSec), command], {
    timeoutMs: (timeoutSec + 15) * 1000,
  });
}

/** Every container on the host as `docker ps` rows for hooks.groupContainersByResource. */
export async function listContainersForDiscovery(format: string): Promise<string> {
  const r = await docker(["ps", "-a", "--format", format]);
  return r.code === 0 ? r.stdout : "";
}

export async function dockerVersion(): Promise<string> {
  const r = await docker(["version", "--format", "{{.Server.Version}}"]);
  return r.code === 0 ? r.stdout.trim() : "unknown";
}

export async function countContainers(): Promise<number> {
  const r = await docker(["ps", "-q"]);
  if (r.code !== 0) return 0;
  return r.stdout.split("\n").filter((l) => l.trim().length > 0).length;
}

/**
 * Best-effort list of Coolify resource UUIDs present on this Docker host.
 * Coolify names volumes `<uuid>_<suffix>` and embeds the uuid in container
 * names, so we harvest uuid-looking tokens from both. The controller matches
 * them against known resources to auto-detect which server this agent serves.
 */
export async function detectCoolifyResourceUuids(limit = 200): Promise<string[]> {
  const tokens = new Set<string>();
  const isUuid = (s: string) => /^[a-z0-9]{20,32}$/.test(s);

  const vols = await docker(["volume", "ls", "--format", "{{.Name}}"]);
  if (vols.code === 0) {
    for (const name of vols.stdout.split("\n")) {
      const prefix = name.trim().split("_")[0];
      if (prefix && isUuid(prefix)) tokens.add(prefix);
    }
  }

  const ps = await docker(["ps", "-a", "--format", "{{.Names}}"]);
  if (ps.code === 0) {
    for (const line of ps.stdout.split("\n")) {
      for (const part of line.trim().split(/[-_]/)) {
        if (isUuid(part)) tokens.add(part);
      }
    }
  }

  return [...tokens].slice(0, limit);
}
