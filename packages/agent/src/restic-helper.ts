import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { redactSecrets } from "@cbm/shared";
import { docker, type RunResult, type SecretEnv } from "./docker.js";
import { LOCK_WAIT, RESTIC_ENV_KEYS, backupSummaryId, lockWatcher, resticForget, type ResticCtx } from "./restic.js";
import { resticBackupExcludes, resticRestoreExcludes } from "./excludes.js";

/*
 * restic run straight on a volume (or host folder): a throwaway container from
 * the agent's own image, with the volume mounted read-only at a stable path.
 * restic then reads only the files changed since the previous snapshot of that
 * path, and nothing is copied to the agent host first. The helper shares the
 * agent's volumes (work dir, local repositories) and network, so it reaches the
 * repository exactly as the agent does.
 */

type Self = { id: string; image: string } | null;
let selfP: Promise<Self> | null = null;

/** The agent's own container (the normal install), or null when run natively. */
export function selfContainer(): Promise<Self> {
  selfP ??= (async () => {
    const candidates: string[] = [];
    try {
      const m = (await readFile("/proc/self/mountinfo", "utf8")).match(/\/containers\/([0-9a-f]{64})\//);
      if (m) candidates.push(m[1]);
    } catch {
      /* not Linux */
    }
    // Docker's default hostname is the short container id.
    if (existsSync("/.dockerenv")) candidates.push(hostname());
    for (const c of candidates) {
      const r = await docker(["inspect", "--format", "{{.Id}} {{.Image}}", c]);
      const [id, image] = r.code === 0 ? r.stdout.trim().split(" ") : [];
      if (id && image) return { id, image };
    }
    return null;
  })();
  return selfP;
}

/** Single-quote a token for POSIX sh. */
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const SNAPSHOT_ID = /^[0-9a-f]{8,64}$/;
/** Paths inside a snapshot are ours (`/volume/<name>`, `/bind/<name>`). */
const SNAPSHOT_PATH = /^\/(volume|bind)\/(?!\.+$)[A-Za-z0-9._-]+$/;
const OWNER = /^\d+:\d+$/;
const MODE = /^[0-7]{3,4}$/;

/** Where a volume or host folder lives inside its restic snapshot. */
export function snapshotPath(kind: "volume" | "bind", name: string): string {
  const p = `/${kind}/${name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
  if (!SNAPSHOT_PATH.test(p)) throw new Error(`unsupported name for a restic path: ${name}`);
  return p;
}

/** The root folder's owner and mode, which restic restores for its content only. */
export type RootStat = { owner: string; mode: string };

async function helper(
  ctx: ResticCtx,
  workDir: string,
  mounts: string[],
  command: { restic: string[] } | { sh: string },
): Promise<RunResult> {
  const self = await selfContainer();
  const image = self?.image ?? process.env.AGENT_HELPER_IMAGE;
  if (!image) throw new Error("restic on a volume needs the agent to run in Docker (or AGENT_HELPER_IMAGE)");
  const name = `cbm-restic-${randomBytes(6).toString("hex")}`;
  const args = ["run", "--rm", "--init", "--name", name, "--label", "cbm.restic=1"];
  if (self) {
    args.push("--volumes-from", self.id, "--network", `container:${self.id}`);
  } else {
    args.push("--network", "host");
    const cache = ctx.env.RESTIC_CACHE_DIR;
    for (const p of new Set([...ctx.paths, workDir, ...(cache ? [cache] : [])])) args.push("-v", `${p}:${p}`);
  }
  // Values come from docker's own environment, never its arguments.
  const secrets: SecretEnv = {};
  for (const k of RESTIC_ENV_KEYS) {
    const v = ctx.env[k];
    if (v !== undefined) {
      secrets[k] = v;
      args.push("-e", k);
    }
  }
  for (const m of mounts) args.push("-v", m);
  if ("restic" in command) args.push("--entrypoint", "restic", image, ...ctx.args, ...command.restic);
  else args.push("--entrypoint", "sh", image, "-c", command.sh);
  try {
    return await docker(args, secrets, lockWatcher(ctx));
  } finally {
    // A helper that outlived its command (agent stopped mid-way) is removed.
    await docker(["rm", "-f", name]).catch(() => undefined);
  }
}

/** `restic …` with the context's global args, for a helper's shell script. */
const resticCmd = (ctx: ResticCtx) => ["restic", ...ctx.args].map(shq).join(" ");

const fail = (what: string, r: RunResult) => {
  const out = redactSecrets((r.stderr || r.stdout).trim().slice(-500));
  // 137 = SIGKILL (the helper was killed: out of memory, `docker kill`, agent stop).
  return new Error(`${what} failed (exit ${r.code}${r.code === 137 ? ", killed" : ""})${out ? `: ${out}` : ""}`);
};

export type PathBackup = { id: string; bytes: number; filesNew: number; filesChanged: number; filesUnmodified: number; added: number };

/**
 * Back up a volume (by name) or a host folder (absolute path) as `path` in a new
 * restic snapshot. The previous snapshot of the same path is restic's parent:
 * unchanged files aren't read again.
 */
export async function resticBackupPath(
  ctx: ResticCtx,
  workDir: string,
  source: string,
  path: string,
  tags: string[],
  opts: {
    /** How long to wait for another command's lock (short while containers are frozen). */
    lockWait?: string;
    /** Paths left out (see excludes.ts). */
    excludes?: string[];
  } = {},
): Promise<PathBackup> {
  if (!SNAPSHOT_PATH.test(path)) throw new Error(`unsupported restic path: ${path}`);
  const args = [
    "backup",
    path,
    "--host",
    "cbm",
    "--json",
    "--quiet",
    "--retry-lock",
    opts.lockWait ?? LOCK_WAIT,
    ...resticBackupExcludes(path, opts.excludes ?? []),
  ];
  for (const t of tags) args.push("--tag", t);
  const r = await helper(ctx, workDir, [`${source}:${path}:ro`], { restic: args });
  const id = backupSummaryId(r.stdout);
  if (r.code !== 0) {
    // exit 3 = some files couldn't be read, yet a snapshot was saved: drop it.
    if (id) await resticForget(ctx, [id], false, "1m").catch(() => undefined);
    throw fail(`restic backup of ${path}`, r);
  }
  if (!id) throw new Error(`restic backup of ${path} did not report a snapshot id`);
  let s: Record<string, number> = {};
  for (const line of r.stdout.split("\n")) {
    try {
      const o = JSON.parse(line);
      if (o.message_type === "summary") s = o;
    } catch {
      /* not JSON */
    }
  }
  return {
    id,
    bytes: s.total_bytes_processed ?? 0,
    filesNew: s.files_new ?? 0,
    filesChanged: s.files_changed ?? 0,
    filesUnmodified: s.files_unmodified ?? 0,
    added: s.data_added ?? 0,
  };
}

/** One volume or host folder of a grouped backup (see resticBackupPaths). */
export type PathSource = { source: string; path: string; excludes?: string[] };

/**
 * Back up several volumes / host folders as ONE restic snapshot (each under its
 * own path): one restic start and one index load instead of one per folder,
 * which is what a frozen pass costs. The previous snapshot of the same set of
 * paths is the parent, so unchanged files aren't read again; restore and
 * mirror still address each folder as `<id>:<path>`. With `sizes`, also
 * measures each folder (du, KiB) - restic only reports the total.
 */
export async function resticBackupPaths(
  ctx: ResticCtx,
  workDir: string,
  items: PathSource[],
  tags: string[],
  opts: { lockWait?: string; sizes?: boolean } = {},
): Promise<PathBackup & { sizes: Map<string, number> }> {
  if (!items.length) throw new Error("nothing to back up");
  for (const i of items) if (!SNAPSHOT_PATH.test(i.path)) throw new Error(`unsupported restic path: ${i.path}`);
  const args = ["backup", ...items.map((i) => i.path), "--host", "cbm", "--json", "--quiet", "--retry-lock", opts.lockWait ?? LOCK_WAIT];
  for (const i of items) args.push(...resticBackupExcludes(i.path, i.excludes ?? []));
  for (const t of tags) args.push("--tag", t);
  const mounts = items.map((i) => `${i.source}:${i.path}:ro`);
  const paths = items.map((i) => shq(i.path)).join(" ");
  const r = await helper(
    ctx,
    workDir,
    mounts,
    opts.sizes
      ? { sh: `${resticCmd(ctx)} ${args.map(shq).join(" ")}; rc=$?; du -sk ${paths} 2>/dev/null | sed 's/^/CBM_DU /'; exit $rc` }
      : { restic: args },
  );
  const id = backupSummaryId(r.stdout);
  if (r.code !== 0) {
    if (id) await resticForget(ctx, [id], false, "1m").catch(() => undefined);
    throw fail(`restic backup of ${items.length} folder(s)`, r);
  }
  if (!id) throw new Error("restic backup did not report a snapshot id");
  let s: Record<string, number> = {};
  const sizes = new Map<string, number>();
  for (const line of r.stdout.split("\n")) {
    const du = /^CBM_DU (\d+)\s+(\S+)/.exec(line);
    if (du) {
      sizes.set(du[2], Number(du[1]) * 1024);
      continue;
    }
    try {
      const o = JSON.parse(line);
      if (o.message_type === "summary") s = o;
    } catch {
      /* not JSON */
    }
  }
  return {
    id,
    bytes: s.total_bytes_processed ?? 0,
    filesNew: s.files_new ?? 0,
    filesChanged: s.files_changed ?? 0,
    filesUnmodified: s.files_unmodified ?? 0,
    added: s.data_added ?? 0,
    sizes,
  };
}

/** `target` is a shell word as written in the script (a fixed path or "$T"). */
function rootFix(target: string, root?: RootStat): string {
  if (!root) return "";
  if (!OWNER.test(root.owner) || !MODE.test(root.mode)) throw new Error("invalid root owner/mode in the manifest");
  return `; chown ${root.owner} ${target}; chmod ${root.mode} ${target}`;
}

function checkRef(id: string, path: string) {
  if (!SNAPSHOT_ID.test(id)) throw new Error(`invalid restic snapshot id: ${id}`);
  if (!SNAPSHOT_PATH.test(path)) throw new Error(`unsupported restic path: ${path}`);
}

/**
 * Restore `path` of snapshot `id` into a volume (by name) or a host folder,
 * replacing its content: files absent from the snapshot are deleted - except
 * the excluded paths, left as they are - and the root folder gets back its
 * owner and mode.
 */
export async function resticRestorePath(
  ctx: ResticCtx,
  workDir: string,
  id: string,
  path: string,
  target: string,
  root?: RootStat,
  excludes: string[] = [],
): Promise<void> {
  checkRef(id, path);
  const ex = resticRestoreExcludes(excludes).map(shq).join(" ");
  const sh = `set -e; ${resticCmd(ctx)} restore ${id}:${path} --target /data --delete --quiet --retry-lock ${LOCK_WAIT}${ex ? ` ${ex}` : ""}${rootFix("/data", root)}`;
  const r = await helper(ctx, workDir, [`${target}:/data`], { sh });
  if (r.code !== 0) throw fail(`restic restore of ${path}`, r);
}

/** Read `path` of snapshot `id` back end to end (every blob checked by restic)
 * and count its entries - a restore drill's check, with nothing kept locally. */
export async function resticCountPath(ctx: ResticCtx, workDir: string, id: string, path: string): Promise<number> {
  checkRef(id, path);
  const sh = `set -o pipefail; ${resticCmd(ctx)} dump --retry-lock ${LOCK_WAIT} ${id} ${path} | tar -tf - | wc -l`;
  const r = await helper(ctx, workDir, [], { sh });
  if (r.code !== 0) throw fail(`reading ${path} back`, r);
  const n = Number.parseInt(r.stdout.trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`could not count the entries of ${path} (got "${r.stdout.trim()}")`);
  return n;
}

/** Turn `path` of snapshot `id` into a tar at `outFile` (inside the work dir),
 * shaped like the tar engine's volume archives - for a mirror copy. */
export async function resticTarPath(
  ctx: ResticCtx,
  workDir: string,
  id: string,
  path: string,
  outFile: string,
  root?: RootStat,
): Promise<void> {
  checkRef(id, path);
  const dir = dirname(outFile);
  const sh =
    `set -e; T=$(mktemp -d -p ${shq(dir)}); trap 'rm -rf "$T"' EXIT; ` +
    `${resticCmd(ctx)} restore ${id}:${path} --target "$T" --quiet --retry-lock ${LOCK_WAIT}${rootFix('"$T"', root)}; ` +
    `tar -cf ${shq(outFile)} -C "$T" .`;
  const r = await helper(ctx, workDir, [], { sh });
  if (r.code !== 0) throw fail(`unpacking ${path}`, r);
}
