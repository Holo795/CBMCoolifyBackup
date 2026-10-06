import { readdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import type { ResolvedDestination } from "@cbm/shared";
import { runCapture, type RunResult } from "./proc.js";

let RESTIC = "restic";
export function setResticBin(bin: string) {
  RESTIC = bin;
}

export type ResticRun = RunResult;

/**
 * Everything needed to run restic against one destination: the repo URL + auth
 * env, any global `-o` args (the SFTP backend command for ssh destinations), and
 * a cleanup that removes the temp key/password files. Build once per job, run
 * all restic commands with it, then `cleanup()`.
 */
export interface ResticCtx {
  env: NodeJS.ProcessEnv;
  args: string[];
  cleanup: () => Promise<void>;
  /** Host paths restic reads besides the volume (a local repository, the ssh
   * connect script and keys) - mounted into a helper container when the agent
   * doesn't run in one itself (see restic-helper.ts). */
  paths: string[];
}

/** Environment variables a restic context sets (forwarded to helper containers). */
export const RESTIC_ENV_KEYS = [
  "RESTIC_PASSWORD",
  "RESTIC_REPOSITORY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_DEFAULT_REGION",
] as const;

/** Single-quote a token for POSIX sh (used when writing the connect script). */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

const SSH_OPTS = (knownHosts: string) => [
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  `UserKnownHostsFile=${knownHosts}`,
  "-o",
  "ConnectTimeout=20",
];

/** restic's S3 endpoint: keep the endpoint's scheme (an http:// MinIO/SeaweedFS
 * must not be dialled over TLS - restic then retries for ~15 min), https when
 * none is given, AWS when there is no endpoint. */
export function resticS3Endpoint(endpoint?: string): string {
  if (!endpoint) return "s3.amazonaws.com";
  const ep = endpoint.replace(/\/$/, "");
  return /^https?:\/\//.test(ep) ? ep : `https://${ep}`;
}

/**
 * `tmpBase`: where the ssh connect script and keys go - the agent's work dir
 * when a helper container runs restic, so the helper sees them (it shares the
 * agent's volumes, not its /tmp).
 */
export async function resticContext(dest: ResolvedDestination, password: string, tmpBase = tmpdir()): Promise<ResticCtx> {
  const env: NodeJS.ProcessEnv = { ...process.env, RESTIC_PASSWORD: password };

  if (dest.type === "local") {
    env.RESTIC_REPOSITORY = `${dest.basePath.replace(/\/$/, "")}/restic-repo`;
    return { env, args: [], cleanup: async () => {}, paths: [dest.basePath] };
  }

  if (dest.type === "s3") {
    const prefix = dest.prefix ? `${dest.prefix.replace(/^\/|\/$/g, "")}/` : "";
    env.RESTIC_REPOSITORY = `s3:${resticS3Endpoint(dest.endpoint)}/${dest.bucket}/${prefix}restic-repo`;
    env.AWS_ACCESS_KEY_ID = dest.accessKeyId;
    env.AWS_SECRET_ACCESS_KEY = dest.secretAccessKey;
    env.AWS_DEFAULT_REGION = dest.region || "us-east-1";
    return { env, args: [], cleanup: async () => {}, paths: [] };
  }

  // ssh / sftp: restic's sftp backend shells out to ssh. We build a full ssh
  // command (key via -i, password via sshpass -f, bastion via a nested
  // ProxyCommand) and hand it to restic as `-o sftp.command=…`.
  const tmp = await mkdtemp(join(tmpBase, "cbm-restic-"));
  const secretFile = async (name: string, content: string, withNewline: boolean) => {
    const p = join(tmp, name);
    await writeFile(p, withNewline && !content.endsWith("\n") ? `${content}\n` : content, { mode: 0o600 });
    return p;
  };
  const knownHosts = await secretFile("known_hosts", "", false);

  // Build the auth prefix (sshpass) + key option for one hop.
  const hop = async (tag: string, key?: string, pwd?: string): Promise<{ prefix: string[]; keyOpt: string[] }> => {
    const prefix: string[] = [];
    const keyOpt: string[] = [];
    if (key) keyOpt.push("-i", await secretFile(`key_${tag}`, key, true));
    if (pwd) prefix.push("sshpass", "-f", await secretFile(`pw_${tag}`, pwd, false));
    return { prefix, keyOpt };
  };

  const proxy: string[] = [];
  if (dest.jumpHost) {
    const j = await hop("jump", dest.jumpPrivateKey || dest.privateKey, dest.jumpPassword || dest.password);
    const jumpCmd = [
      ...j.prefix,
      "ssh",
      ...j.keyOpt,
      ...SSH_OPTS(knownHosts),
      "-W",
      "%h:%p",
      "-p",
      String(dest.jumpPort),
      `${dest.jumpUsername || dest.username}@${dest.jumpHost}`,
    ].join(" ");
    proxy.push("-o", `ProxyCommand=${jumpCmd}`);
  }

  const t = await hop("target", dest.privateKey, dest.password);
  const sftpTokens = [
    ...t.prefix,
    "ssh",
    ...t.keyOpt,
    ...SSH_OPTS(knownHosts),
    ...proxy,
    "-p",
    String(dest.port),
    `${dest.username}@${dest.host}`,
    "-s",
    "sftp",
  ];

  // restic parses the `-o sftp.command=…` value (CSV) and shell-splits it before
  // exec; the embedded quotes a bastion ProxyCommand needs break that parser.
  // Sidestep it: write the whole ssh invocation to an executable script and give
  // restic only the script's (space-free) path.
  const connect = join(tmp, "connect.sh");
  await writeFile(connect, `#!/bin/sh\nexec ${sftpTokens.map(shq).join(" ")}\n`, { mode: 0o700 });

  env.RESTIC_REPOSITORY = `sftp:${dest.username}@${dest.host}:${posix.join(dest.basePath, "restic-repo")}`;
  return {
    env,
    args: ["-o", `sftp.command=${connect}`],
    paths: [tmp],
    cleanup: async () => {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/**
 * Build a restic context for a destination, run `fn` with it, and always clean
 * up the temp key/password files afterwards. Use this instead of calling
 * `resticContext` + `cleanup()` by hand so cleanup can't be forgotten.
 */
export async function withResticCtx<T>(
  dest: ResolvedDestination,
  password: string,
  fn: (ctx: ResticCtx) => Promise<T>,
  tmpBase?: string,
): Promise<T> {
  const ctx = await resticContext(dest, password, tmpBase);
  try {
    return await fn(ctx);
  } finally {
    await ctx.cleanup();
  }
}

/**
 * How long a command waits for a lock held by another one (`--retry-lock`)
 * instead of failing at once: a prune right after a backup otherwise collides
 * with the mirror reading the same repository.
 */
export const LOCK_WAIT = "30m";

/** Run a restic command, buffering stdout/stderr. Global ctx args come first. */
export function restic(ctx: ResticCtx, args: string[]): Promise<ResticRun> {
  return runCapture(RESTIC, [...ctx.args, ...args], { env: ctx.env });
}

// Serialise repo initialisation per repository so concurrent jobs (the agent
// runs several at once) don't race to `restic init` a brand-new repo.
const ensuring = new Map<string, Promise<void>>();

/** Initialise the repo if it doesn't exist yet (idempotent, race-safe). */
export async function resticEnsureRepo(ctx: ResticCtx): Promise<void> {
  const repo = ctx.env.RESTIC_REPOSITORY ?? "";
  const existing = ensuring.get(repo);
  if (existing) return existing;
  const p = (async () => {
    const check = await restic(ctx, ["cat", "config", "--no-lock"]);
    if (check.code === 0) return;
    const init = await restic(ctx, ["init"]);
    if (init.code !== 0 && !/already initialized|already exists|config already/i.test(init.stderr)) {
      throw new Error(`restic init failed: ${init.stderr.slice(0, 500)}`);
    }
  })().finally(() => ensuring.delete(repo));
  ensuring.set(repo, p);
  return p;
}

/** The snapshot id in `restic backup --json` output (its summary line), if any. */
export function backupSummaryId(stdout: string): string | null {
  for (const line of stdout.split("\n").reverse()) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try {
      const obj = JSON.parse(s);
      if (obj.message_type === "summary" && obj.snapshot_id) return obj.snapshot_id as string;
    } catch {
      /* ignore non-JSON lines */
    }
  }
  return null;
}

/**
 * Back up a staging directory into the repo, tagged so it can be found later.
 * Returns the new restic snapshot id.
 */
export async function resticBackupDir(ctx: ResticCtx, dir: string, tags: string[]): Promise<string> {
  const args = ["backup", dir, "--host", "cbm", "--json", "--retry-lock", LOCK_WAIT];
  for (const t of tags) args.push("--tag", t);
  const r = await restic(ctx, args);
  if (r.code !== 0) throw new Error(`restic backup failed: ${r.stderr.slice(0, 500)}`);
  const id = backupSummaryId(r.stdout);
  if (!id) throw new Error("restic backup did not report a snapshot id");
  return id;
}

/**
 * Restore a specific restic snapshot id into targetRoot; returns the directory
 * that holds the restored manifest.json (restic recreates the original absolute
 * paths under the target, so we locate the manifest by scanning).
 */
export async function resticRestoreById(ctx: ResticCtx, snapshotId: string, targetRoot: string): Promise<string> {
  const r = await restic(ctx, ["restore", snapshotId, "--target", targetRoot, "--retry-lock", LOCK_WAIT]);
  if (r.code !== 0) throw new Error(`restic restore failed: ${r.stderr.slice(0, 500)}`);
  const found = await findManifestDir(targetRoot);
  if (!found) throw new Error("restic restore produced no manifest.json");
  return found;
}

/** Forget specific snapshots by id and (unless `prune` is false) prune freed data. */
export async function resticForget(ctx: ResticCtx, snapshotIds: string[], prune = true): Promise<void> {
  if (snapshotIds.length === 0) return;
  const r = await restic(ctx, ["forget", ...snapshotIds, ...(prune ? ["--prune"] : []), "--retry-lock", LOCK_WAIT]);
  if (r.code !== 0) throw new Error(`restic forget failed: ${r.stderr.slice(0, 500)}`);
}

/**
 * Integrity check of the whole repository (`restic check`): verifies the index,
 * that every referenced pack exists, and the tree structure. When
 * `readDataSubset` is given (e.g. "5%" or "100%"), restic also re-reads and
 * re-hashes that share of the pack data to catch silent on-disk corruption.
 * Returns { ok, detail } rather than throwing, so the caller can report it.
 */
export async function resticCheck(ctx: ResticCtx, readDataSubset?: string): Promise<{ ok: boolean; detail: string }> {
  const args = ["check", "--no-lock"];
  if (readDataSubset) args.push(`--read-data-subset=${readDataSubset}`);
  const r = await restic(ctx, args);
  const out = `${r.stdout}\n${r.stderr}`.trim();
  // `restic check` exits non-zero on any error; the last lines carry the reason.
  const detail = out.split("\n").slice(-6).join("\n").slice(0, 800);
  return { ok: r.code === 0, detail: r.code === 0 ? "no errors" : detail || "restic check failed" };
}

/** List all snapshot ids currently in the repo (full + short ids). */
export async function resticListSnapshotIds(ctx: ResticCtx): Promise<Set<string>> {
  const r = await restic(ctx, ["snapshots", "--no-lock", "--json"]);
  if (r.code !== 0) throw new Error(`restic snapshots failed: ${r.stderr.slice(0, 300)}`);
  const ids = new Set<string>();
  try {
    for (const s of JSON.parse(r.stdout) as Array<{ id?: string; short_id?: string }>) {
      if (s.short_id) ids.add(s.short_id);
      if (s.id) ids.add(s.id);
    }
  } catch {
    /* empty repo prints [] */
  }
  return ids;
}

/** Recursively find the directory containing a manifest.json under root. */
async function findManifestDir(root: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.isFile() && e.name === "manifest.json") return root;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = await findManifestDir(join(root, e.name));
      if (found) return found;
    }
  }
  return null;
}
