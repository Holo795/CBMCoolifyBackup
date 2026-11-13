import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, posix } from "node:path";
import { pipeline } from "node:stream/promises";
import type { ResolvedDestination } from "@cbm/shared";
import { prisma } from "./prisma";
import { env } from "./env";
import { UserError } from "./user-error";
import { encryptFileWithKey } from "./crypto";
import { resolveDestination } from "./jobs";

/** Fixed remote path of the (single, overwritten) self-backup artefact. */
export const SELF_BACKUP_DIR = "cbm-self-backup";
export const SELF_BACKUP_FILE = "metadata.dump.enc";
export const SELF_BACKUP_PATH = `${SELF_BACKUP_DIR}/${SELF_BACKUP_FILE}`;

/** Collapse change bursts into one dump at most every this often. */
const THROTTLE_MS = 5 * 60_000;
/** Safety re-run: guarantee at least one dump per day even without changes. */
const SAFETY_MS = 24 * 60 * 60_000;
/** After a failure, the next try comes this much later (it came every minute). */
export const SELF_BACKUP_RETRY_MS = 10 * 60_000;
/** A failure is alerted once it lasts this long (a host rebooting, a few
 * minutes of network trouble, pass without an alert). */
export const SELF_BACKUP_ALERT_AFTER_MS = 60 * 60_000;

/** Pure: should this failure, failing since `since`, be alerted now? */
export function selfBackupFailureAlertDue(now: Date, since: Date, alertedAt: Date | null): boolean {
  return !alertedAt && now.getTime() - since.getTime() >= SELF_BACKUP_ALERT_AFTER_MS;
}

/* ------------------------- destination file transfer ------------------------- *
 * Controller-side upload/download of a single file, mirroring the connection
 * patterns of destination-test.ts (ssh incl. jump host; s3). "local" is refused
 * for self-backups (it dies with the machine) but supported for completeness.
 * ----------------------------------------------------------------------------- */

async function withSftp<T>(
  dest: Extract<ResolvedDestination, { type: "ssh" }>,
  fn: (client: import("ssh2-sftp-client")) => Promise<T>,
): Promise<T> {
  const { connectSftp, learnHostKeys } = await import("./ssh-hostkeys");
  const seen: Record<string, string> = {};
  const { client, close } = await connectSftp(dest, seen);
  try {
    return await fn(client);
  } finally {
    await close();
    await learnHostKeys(seen).catch(() => undefined);
  }
}

/** Upload a local file to `relPath` under the destination root (overwrites). */
export async function uploadFileToDestination(
  dest: ResolvedDestination,
  relPath: string,
  localFile: string,
): Promise<void> {
  if (dest.type === "local") {
    const target = join(dest.basePath, relPath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(localFile, target);
    return;
  }
  if (dest.type === "ssh") {
    await withSftp(dest, async (client) => {
      const target = posix.join(dest.basePath, relPath);
      await client.mkdir(posix.dirname(target), true).catch(() => undefined);
      await client.fastPut(localFile, target);
    });
    return;
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: dest.region,
    endpoint: dest.endpoint || undefined,
    forcePathStyle: dest.forcePathStyle,
    credentials: { accessKeyId: dest.accessKeyId, secretAccessKey: dest.secretAccessKey },
  });
  const { stat } = await import("node:fs/promises");
  const { size } = await stat(localFile);
  await client.send(
    new PutObjectCommand({
      Bucket: dest.bucket,
      Key: posix.join(dest.prefix || "", relPath),
      Body: createReadStream(localFile),
      ContentLength: size,
    }),
  );
}

/** Download `relPath` from the destination into a local file. */
export async function downloadFileFromDestination(
  dest: ResolvedDestination,
  relPath: string,
  localFile: string,
): Promise<void> {
  if (dest.type === "local") {
    await copyFile(join(dest.basePath, relPath), localFile);
    return;
  }
  if (dest.type === "ssh") {
    await withSftp(dest, async (client) => {
      await client.fastGet(posix.join(dest.basePath, relPath), localFile);
    });
    return;
  }
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: dest.region,
    endpoint: dest.endpoint || undefined,
    forcePathStyle: dest.forcePathStyle,
    credentials: { accessKeyId: dest.accessKeyId, secretAccessKey: dest.secretAccessKey },
  });
  const res = await client.send(
    new GetObjectCommand({ Bucket: dest.bucket, Key: posix.join(dest.prefix || "", relPath) }),
  );
  await pipeline(res.Body as NodeJS.ReadableStream, createWriteStream(localFile));
}

/* ------------------------------- pg_dump ------------------------------- */

/** pg_dump the controller's own metadata DB to `outFile` (custom format:
 * single compressed file, restorable with pg_restore). */
export async function dumpMetadataDb(outFile: string): Promise<void> {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not set");
  await new Promise<void>((resolve, reject) => {
    const p = spawn("pg_dump", ["--format=custom", "--no-owner", "--file", outFile, "--dbname", env.databaseUrl], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("error", (e) =>
      reject(
        (e as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error("pg_dump not found - the controller image needs the postgresql client tools")
          : e,
      ),
    );
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}: ${err.slice(0, 400)}`))));
  });
}

/* ------------------------------ the self-backup ------------------------------ */

/** Dump + encrypt + upload the metadata DB to the configured destination,
 * overwriting the single artefact in place. Records status on the Setting row.
 * `alertOnFailure` (scheduled runs) webhooks once per failure episode; manual
 * runs surface the error in the UI instead. */
export async function runSelfBackup(
  opts?: { alertOnFailure?: boolean },
): Promise<{ ok: boolean; error?: string | UserError }> {
  const setting = await prisma.setting.findUnique({ where: { id: "global" } });
  if (!setting?.selfBackupEnabled || !setting.selfBackupDestinationId) {
    return { ok: false, error: new UserError("messages.selfBackupNotConfigured") };
  }
  const dest = await prisma.destination.findUnique({ where: { id: setting.selfBackupDestinationId } });
  if (!dest) return await fail(new UserError("messages.selfBackupDestGone"));
  if (dest.type === "local") return await fail(new UserError("messages.localDiesWithMachine"));

  const stage = await mkdtemp(join(tmpdir(), "cbm-selfbackup-"));
  try {
    const plain = join(stage, "metadata.dump");
    const enc = join(stage, SELF_BACKUP_FILE);
    await dumpMetadataDb(plain);
    await encryptFileWithKey(plain, enc); // master key
    await uploadFileToDestination(resolveDestination(dest), SELF_BACKUP_PATH, enc);
    await prisma.setting.update({
      where: { id: "global" },
      data: { selfBackupLastRunAt: new Date(), selfBackupLastStatus: "ok" },
    });
    await failures({ selfBackupAttemptAt: new Date(), selfBackupFailingSince: null, selfBackupAlertedAt: null });
    return { ok: true };
  } catch (e) {
    return await fail((e as Error).message);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }

  // The status row and the webhook alert keep the English text; the caller
  // gets the UserError itself so the UI can translate it.
  async function fail(error: string | UserError): Promise<{ ok: false; error: string | UserError }> {
    const message = typeof error === "string" ? error : error.message;
    await prisma.setting
      .update({ where: { id: "global" }, data: { selfBackupLastStatus: message.slice(0, 500) } })
      .catch(() => undefined);
    // Alerted once per failure episode, once it has lasted an hour (scheduled
    // runs only; a manual run shows its error).
    const now = new Date();
    const state = await prisma.schedulerState.findUnique({ where: { id: "global" } }).catch(() => null);
    const since = state?.selfBackupFailingSince ?? now;
    const alert = !!opts?.alertOnFailure && selfBackupFailureAlertDue(now, since, state?.selfBackupAlertedAt ?? null);
    await failures({ selfBackupAttemptAt: now, selfBackupFailingSince: since, ...(alert ? { selfBackupAlertedAt: now } : {}) });
    if (alert) {
      const { notifySelfBackupProblem } = await import("./notify");
      const minutes = Math.round((now.getTime() - since.getTime()) / 60_000);
      await notifySelfBackupProblem(`${message} (failing for ${minutes} min)`).catch(() => undefined);
    }
    return { ok: false, error };
  }
}

/** The failure bookkeeping, kept out of Setting (its changes trigger a self-backup). */
async function failures(data: { selfBackupAttemptAt: Date; selfBackupFailingSince: Date | null; selfBackupAlertedAt?: Date | null }) {
  await prisma.schedulerState
    // (Created with the current minute: the scheduler replays the minutes after lastMinute.)
    .upsert({ where: { id: "global" }, create: { id: "global", lastMinute: Math.floor(Date.now() / 60_000), ...data }, update: data })
    .catch(() => undefined);
}

/**
 * Drill: prove the recovery path works WITHOUT a destructive restore — download
 * the latest self-backup from its destination and decrypt it with the master
 * key, then check it looks like a real pg_dump (custom format magic "PGDMP").
 * This is what makes "I have a recovery file" trustworthy.
 */
export async function verifyLatestSelfBackup(): Promise<{ ok: boolean; detail?: UserError; error?: UserError }> {
  const setting = await prisma.setting.findUnique({ where: { id: "global" } });
  if (!setting?.selfBackupEnabled || !setting.selfBackupDestinationId) {
    return { ok: false, error: new UserError("messages.selfBackupNotConfigured") };
  }
  const dest = await prisma.destination.findUnique({ where: { id: setting.selfBackupDestinationId } });
  if (!dest) return { ok: false, error: new UserError("messages.selfBackupDestGone") };

  const { decryptFileWithKey } = await import("./crypto");
  const stage = await mkdtemp(join(tmpdir(), "cbm-verify-"));
  try {
    const enc = join(stage, SELF_BACKUP_FILE);
    const plain = join(stage, "metadata.dump");
    await downloadFileFromDestination(resolveDestination(dest), SELF_BACKUP_PATH, enc);
    await decryptFileWithKey(enc, plain); // master key
    const { open } = await import("node:fs/promises");
    const fh = await open(plain, "r");
    try {
      const buf = Buffer.alloc(5);
      await fh.read(buf, 0, 5, 0);
      if (buf.toString("latin1") !== "PGDMP") {
        return { ok: false, error: new UserError("messages.notAPgDump") };
      }
    } finally {
      await fh.close();
    }
    const { size } = await (await import("node:fs/promises")).stat(plain);
    return { ok: true, detail: new UserError("messages.recoveryPathWorks", { size: Math.round(size / 1024) }) };
  } catch (e) {
    return { ok: false, error: new UserError("messages.recoveryCheckFailed", { error: (e as Error).message }) };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

let running = false;

/**
 * Change-driven trigger, called from the scheduler tick (every minute): dump
 * when the metadata changed since the last run — throttled so bursts (snapshot
 * rows during backups) collapse into one — plus a daily safety re-run.
 */
export async function maybeSelfBackup(now: Date): Promise<void> {
  if (running) return;
  const setting = await prisma.setting.findUnique({ where: { id: "global" } });
  if (!setting?.selfBackupEnabled || !setting.selfBackupDestinationId) return;

  const last = setting.selfBackupLastRunAt?.getTime() ?? 0;
  if (now.getTime() - last < THROTTLE_MS) return;
  // Failing: the next try 10 minutes after the last one, not every minute.
  const state = await prisma.schedulerState.findUnique({ where: { id: "global" } }).catch(() => null);
  if (state?.selfBackupFailingSince && state.selfBackupAttemptAt && now.getTime() - state.selfBackupAttemptAt.getTime() < SELF_BACKUP_RETRY_MS) {
    return;
  }
  const due = now.getTime() - last >= SAFETY_MS;
  if (!due && !(await metadataChangedSince(setting.selfBackupLastRunAt))) return;

  running = true;
  try {
    const r = await runSelfBackup({ alertOnFailure: true });
    if (!r.ok) console.error("[self-backup] failed:", r.error instanceof UserError ? r.error.message : r.error);
  } finally {
    running = false;
  }
}

/**
 * Overdue check (called from the scheduler, e.g. hourly): the self-backup is
 * enabled but hasn't succeeded in over `OVERDUE_MS` — alert once per episode.
 */
const OVERDUE_MS = 26 * 60 * 60_000; // a bit over the daily safety re-run

export async function checkSelfBackupOverdue(now: Date): Promise<void> {
  const setting = await prisma.setting.findUnique({ where: { id: "global" } });
  if (!setting?.selfBackupEnabled || !setting.selfBackupDestinationId) return;
  const last = setting.selfBackupLastRunAt?.getTime() ?? 0;
  if (now.getTime() - last < OVERDUE_MS) return;
  // Only alert when we're not already in a known-failed state (that path alerts
  // on its own transition), to avoid double-notifying.
  if (setting.selfBackupLastStatus && setting.selfBackupLastStatus !== "ok") return;
  const { notifySelfBackupProblem } = await import("./notify");
  const ago = last ? `${Math.round((now.getTime() - last) / 3_600_000)}h ago` : "never";
  await notifySelfBackupProblem(`The metadata self-backup hasn't succeeded (last success: ${ago}).`).catch(
    () => undefined,
  );
  // Record so the next hourly check doesn't repeat until it recovers/changes.
  await prisma.setting
    .update({ where: { id: "global" }, data: { selfBackupLastStatus: "overdue" } })
    .catch(() => undefined);
}

/** Cheap change detection: any row in a config-bearing table updated since `t`?
 * (Snapshots use startedAt/finishedAt — inserts have no updatedAt bump.) */
async function metadataChangedSince(t: Date | null): Promise<boolean> {
  if (!t) return true;
  // The run itself bumps Setting.updatedAt a few ms after `t` (the bookkeeping
  // write) — compare Setting against t + a small epsilon so a run doesn't
  // re-trigger itself, while a real later settings change still does.
  const settingEpsilon = new Date(t.getTime() + 5_000);
  const counts = await Promise.all([
    prisma.coolifyInstance.count({ where: { updatedAt: { gt: t } } }),
    prisma.destination.count({ where: { updatedAt: { gt: t } } }),
    prisma.backupPolicy.count({ where: { updatedAt: { gt: t } } }),
    prisma.resource.count({ where: { updatedAt: { gt: t } } }),
    prisma.snapshot.count({ where: { OR: [{ startedAt: { gt: t } }, { finishedAt: { gt: t } }] } }),
    prisma.user.count({ where: { updatedAt: { gt: t } } }),
    prisma.invitation.count({ where: { createdAt: { gt: t } } }),
    prisma.setting.count({ where: { id: "global", updatedAt: { gt: settingEpsilon } } }),
  ]);
  return counts.some((n) => n > 0);
}
