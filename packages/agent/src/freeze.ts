import { randomBytes } from "node:crypto";
import type { FreezeMethod } from "@cbm/shared";
import { docker, inspectContainer, pauseContainer, unpauseContainer } from "./docker.js";
import { holdContainer, releaseContainer } from "./held.js";

/*
 * Freezing the containers that write to a volume while it's copied.
 *
 * "pause" is `docker pause`. Docker then reports the container unhealthy, and
 * keeps doing so until its next health check after `docker unpause` - so a
 * proxy that only routes to healthy containers (Coolify's Traefik) can drop it
 * for a whole check interval, even for a one-second freeze.
 *
 * "cgroup" freezes the same way the kernel does for `docker pause` (the cgroup
 * freezer), from a privileged helper container, but Docker isn't told: the
 * container stays healthy as long as the freeze is shorter than its checks
 * allow. If the helper can't run (no privileged containers, unknown cgroup
 * layout), it falls back to "pause".
 */

export interface Freezer {
  readonly method: FreezeMethod;
  freeze(names: string[]): Promise<void>;
  /** Thaw everything given; returns the names that couldn't be thawed. */
  thaw(names: string[]): Promise<string[]>;
  close(): Promise<void>;
}

/** A container's health check, if it has one (seconds). */
export async function healthCheckOf(name: string): Promise<{ intervalS: number; timeoutS: number; retries: number } | null> {
  const hc = (await inspectContainer(name).catch(() => null))?.Config?.Healthcheck;
  if (!hc?.Test?.length || hc.Test[0] === "NONE") return null;
  const s = (ns: number | undefined, def: number) => (ns && ns > 0 ? Math.round(ns / 1e9) : def);
  // Docker's defaults: 30 s interval, 30 s timeout, 3 retries.
  return { intervalS: s(hc.Interval, 30), timeoutS: s(hc.Timeout, 30), retries: hc.Retries && hc.Retries > 0 ? hc.Retries : 3 };
}

export async function healthStatus(name: string): Promise<string | null> {
  return (await inspectContainer(name).catch(() => null))?.State?.Health?.Status ?? null;
}

async function unpauseAll(names: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const n of [...names].reverse()) await unpauseContainer(n).catch(() => failed.push(n));
  return failed;
}

const pauseFreezer: Freezer = {
  method: "pause",
  async freeze(names) {
    const done: string[] = [];
    try {
      for (const n of names) {
        await pauseContainer(n);
        done.push(n);
      }
    } catch (e) {
      await unpauseAll(done);
      throw e;
    }
  },
  thaw: unpauseAll,
  async close() {},
};

/** Single-quote a token for POSIX sh. */
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Where a process's freezer control lives (cgroup v2, else v1), printed as "<kind> <dir>". */
const LOCATE = (pid: number) =>
  `p=$(sed -n 's/^0:://p' /proc/${pid}/cgroup); ` +
  `if [ -n "$p" ] && [ -f "/sys/fs/cgroup$p/cgroup.freeze" ]; then echo "v2 /sys/fs/cgroup$p"; exit 0; fi; ` +
  `p=$(sed -n 's/^[0-9]*:freezer://p' /proc/${pid}/cgroup); ` +
  `if [ -n "$p" ] && [ -f "/sys/fs/cgroup/freezer$p/freezer.state" ]; then echo "v1 /sys/fs/cgroup/freezer$p"; exit 0; fi; exit 1`;

/** Shell that sets every cgroup to `frozen` and waits until the kernel says so (10 s at most). */
export function freezeScript(cgroups: Array<{ kind: "v1" | "v2"; dir: string }>, frozen: boolean): string {
  const set = cgroups
    .map((c) =>
      c.kind === "v2"
        ? `echo ${frozen ? 1 : 0} > ${shq(`${c.dir}/cgroup.freeze`)}`
        : `echo ${frozen ? "FROZEN" : "THAWED"} > ${shq(`${c.dir}/freezer.state`)}`,
    )
    .join("; ");
  const ok = cgroups
    .map((c) =>
      c.kind === "v2"
        ? `grep -q 'frozen ${frozen ? 1 : 0}' ${shq(`${c.dir}/cgroup.events`)}`
        : `grep -q '${frozen ? "FROZEN" : "THAWED"}' ${shq(`${c.dir}/freezer.state`)}`,
    )
    .join(" && ");
  return `set -e; ${set}; i=0; until ${ok}; do i=$((i+1)); [ $i -gt 1000 ] && exit 3; sleep 0.01; done`;
}

/** A freezer working on cgroups through a privileged helper (one per backup). */
async function cgroupFreezer(): Promise<Freezer> {
  const helper = `cbm-freezer-${randomBytes(6).toString("hex")}`;
  const started = await docker([
    "run", "-d", "--rm", "--name", helper, "--label", "cbm.freezer=1",
    "--privileged", "--pid=host", "--cgroupns=host", "--network", "none",
    "-v", "/sys/fs/cgroup:/sys/fs/cgroup",
    "alpine:3.24", "sleep", "3600",
  ]);
  if (started.code !== 0) throw new Error(`can't start the freezer helper: ${started.stderr.trim().slice(0, 300)}`);
  const exec = (script: string) => docker(["exec", helper, "sh", "-c", script]);
  const locate = async (name: string) => {
    const pid = (await inspectContainer(name))?.State?.Pid;
    if (!pid || !Number.isInteger(pid)) throw new Error(`${name} isn't running`);
    const r = await exec(LOCATE(pid));
    const [kind, dir] = r.stdout.trim().split(" ");
    if (r.code !== 0 || (kind !== "v1" && kind !== "v2") || !dir) throw new Error(`no cgroup freezer found for ${name}`);
    return { kind, dir } as { kind: "v1" | "v2"; dir: string };
  };
  const located = new Map<string, { kind: "v1" | "v2"; dir: string }>();
  const thaw = async (names: string[]): Promise<string[]> => {
    const failed: string[] = [];
    for (const n of names) {
      const cg = located.get(n) ?? (await locate(n).catch(() => null));
      if (!cg) {
        // Gone (or not running any more): nothing left frozen.
        releaseContainer(n);
        continue;
      }
      let r = await exec(freezeScript([cg], false));
      if (r.code !== 0) r = await exec(freezeScript([cg], false));
      if (r.code === 0) releaseContainer(n);
      else failed.push(n);
    }
    return failed;
  };
  return {
    method: "cgroup",
    async freeze(names) {
      for (const n of names) located.set(n, await locate(n));
      for (const n of names) holdContainer(n, "frozen"); // before: a crash right after must still thaw it
      const r = await exec(freezeScript(names.map((n) => located.get(n)!), true));
      if (r.code !== 0) {
        await thaw(names);
        throw new Error(`freezing ${names.join(", ")} failed (exit ${r.code}): ${r.stderr.trim().slice(0, 300)}`);
      }
    },
    thaw,
    async close() {
      await docker(["rm", "-f", helper]).catch(() => undefined);
    },
  };
}

/** The freezer to use; "cgroup" falls back to "pause" when it can't run here. */
export async function openFreezer(method: FreezeMethod, warn: (msg: string) => void): Promise<Freezer> {
  if (method !== "cgroup") return pauseFreezer;
  try {
    return await cgroupFreezer();
  } catch (e) {
    warn(`Freeze method "cgroup" unavailable on this host (${(e as Error).message}) - using docker pause`);
    return pauseFreezer;
  }
}

/** Thaw containers left frozen through their cgroup by an interrupted job. */
export async function thawLeftovers(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const f = await cgroupFreezer();
  try {
    return await f.thaw(names);
  } finally {
    await f.close();
  }
}
