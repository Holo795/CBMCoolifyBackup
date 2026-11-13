import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedDestination, SnapshotManifest } from "@cbm/shared";
import { prisma } from "./prisma";
import { env } from "./env";
import { UserError } from "./user-error";
import { masterKeyB64, masterKeyFingerprint, decryptFileWithKey, decryptSecretWithKey, encryptSecret } from "./crypto";
import {
  decodeRecoveryFile,
  encodeRecoveryFile,
  isRecoveryV2,
  MIN_PASSPHRASE,
  passphraseProblem,
  type RecoveryKind,
  type RecoverySecrets,
} from "./recovery-format";
import { resolveDestination } from "./jobs";
import { dumpMetadataDb, downloadFileFromDestination, SELF_BACKUP_PATH } from "./self-backup";
import { version as CBM_VERSION } from "../../package.json";
import { resetTwoFactor } from "./two-factor";
import { reencryptEnvBlobs } from "./env-blobs";

/**
 * The recovery file (format: lib/recovery-format; version 1 below is the one
 * 2.7 and before wrote, still imported): a self-sufficient bootstrap seed held
 * by the operator OUT of band. It carries the master key, the self-backup
 * destination's resolved credentials (so a fresh CBM can fetch the LATEST
 * metadata dump), and an embedded point-in-time dump as a last-resort
 * fallback. The file IS the secret — it is streamed once and never persisted
 * server-side.
 */
export interface RecoveryFile {
  format: "cbm-recovery";
  version: 1;
  generation: number;
  createdAt: string;
  cbmVersion: string;
  /** Latest applied Prisma migration at export time (import version guard). */
  migrationId: string;
  /** Master key of the exporting install (decrypts every secret in the dump). */
  masterKey: string;
  /** Where the always-current self-backup lives (fetch the LATEST dump). */
  selfBackup: { destination: ResolvedDestination; path: string } | null;
  /** Embedded fallback: the metadata dump at export time, encrypted with
   * `masterKey` using the [IV][ciphertext][TAG] file layout, base64-encoded. */
  dump: string;
}

/** Latest applied migration name (for the import version guard). */
async function latestMigrationId(): Promise<string> {
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`;
    return rows[0]?.migration_name ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Migration names shipped with THIS build (the import refuses newer dumps). */
async function localMigrationIds(): Promise<Set<string>> {
  try {
    const dir = join(process.cwd(), "prisma", "migrations");
    const entries = await readdir(dir, { withFileTypes: true });
    return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
  } catch {
    return new Set();
  }
}

/**
 * Build the recovery file (format version 2, see lib/recovery-format) and
 * bump the generation bookkeeping. `light`: the master key and the way to the
 * self-backup only - a few kilobytes, current as long as neither changes;
 * `full`: also the database as it is now, for when the self-backup can't be
 * reached.
 */
export async function buildRecoveryFile(opts: { passphrase: string; kind: RecoveryKind }): Promise<{ filename: string; content: Buffer }> {
  if (passphraseProblem(opts.passphrase)) throw new UserError("messages.recoveryPassphraseShort", { min: MIN_PASSPHRASE });
  const setting = await prisma.setting.findUnique({ where: { id: "global" } });

  // The seed's whole point is reaching the LATEST self-backup — carry the
  // destination resolved (decrypted) so a fresh CBM can dial it directly.
  let selfBackup: RecoverySecrets["selfBackup"] = null;
  if (setting?.selfBackupEnabled && setting.selfBackupDestinationId) {
    const dest = await prisma.destination.findUnique({ where: { id: setting.selfBackupDestinationId } });
    if (dest && dest.type !== "local") {
      selfBackup = { destination: resolveDestination(dest), path: SELF_BACKUP_PATH };
    }
  }
  if (opts.kind === "light" && !selfBackup) throw new UserError("messages.recoveryLightNeedsSelfBackup");

  let dump: Buffer | null = null;
  if (opts.kind === "full") {
    const stage = await mkdtemp(join(tmpdir(), "cbm-recovery-"));
    try {
      const plain = join(stage, "metadata.dump");
      await dumpMetadataDb(plain);
      dump = await readFile(plain);
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }

  const generation = (setting?.recoveryFileGeneration ?? 0) + 1;
  const content = await encodeRecoveryFile(
    {
      kind: opts.kind,
      generation,
      createdAt: new Date().toISOString(),
      cbmVersion: CBM_VERSION,
      migrationId: await latestMigrationId(),
    },
    { masterKey: masterKeyB64(), selfBackup },
    dump,
    opts.passphrase,
  );

  // Bookkeeping for the reveal-once model + the staleness warning.
  const book = {
    recoveryFileGeneration: generation,
    recoveryFileAt: new Date(),
    recoveryFileDestId: setting?.selfBackupDestinationId ?? null,
    recoveryFileKeyFp: masterKeyFingerprint(),
    recoveryFileDestHash: selfBackup ? destinationCredentialsHash(selfBackup.destination as ResolvedDestination) : null,
    recoveryFileFormat: 2,
  };
  await prisma.setting.upsert({ where: { id: "global" }, create: { id: "global", ...book }, update: book });

  const date = new Date().toISOString().slice(0, 10);
  return { filename: `cbm-recovery-g${generation}-${opts.kind}-${date}.cbmrec`, content };
}

/**
 * What a recovery file holds of a destination: an HMAC of its credentials
 * (keyed by the master key), without the SSH host keys learned since. The
 * file is out of date only when this changes.
 */
export function destinationCredentialsHash(dest: ResolvedDestination): string {
  const { hostKey: _h, jumpHostKey: _j, ...creds } = dest as ResolvedDestination & { hostKey?: string; jumpHostKey?: string };
  return createHmac("sha256", Buffer.from(masterKeyB64(), "base64")).update(JSON.stringify(creds)).digest("hex");
}

/** A recovery file opened: what an import needs, whatever its format version. */
export interface OpenedRecovery {
  version: 1 | 2;
  kind: RecoveryKind;
  generation: number;
  cbmVersion: string;
  migrationId: string;
  masterKey: string;
  selfBackup: { destination: ResolvedDestination; path: string } | null;
  /** The database embedded at export time: plain (v2) or encrypted with masterKey (v1). */
  embedded: { plain: Buffer } | { encrypted: Buffer } | null;
}

/**
 * Open an uploaded recovery file: version 2 with its passphrase, version 1
 * (the JSON files of 2.7 and before, master key in clear) as is.
 */
export async function openRecoveryFile(buf: Buffer, passphrase: string): Promise<OpenedRecovery> {
  if (isRecoveryV2(buf)) {
    const { header, secrets, dump } = await decodeRecoveryFile(buf, passphrase);
    return {
      version: 2,
      kind: header.kind,
      generation: header.generation,
      cbmVersion: header.cbmVersion,
      migrationId: header.migrationId,
      masterKey: secrets.masterKey,
      selfBackup: secrets.selfBackup as OpenedRecovery["selfBackup"],
      embedded: dump ? { plain: dump } : null,
    };
  }
  const file = parseRecoveryFile(buf.toString("utf8"));
  return {
    version: 1,
    kind: "full",
    generation: file.generation,
    cbmVersion: file.cbmVersion,
    migrationId: file.migrationId,
    masterKey: file.masterKey,
    selfBackup: file.selfBackup,
    embedded: { encrypted: Buffer.from(file.dump, "base64") },
  };
}

/** Parse + sanity-check a version 1 recovery file (JSON, 2.7 and before). */
export function parseRecoveryFile(raw: string): RecoveryFile {
  let file: RecoveryFile;
  try {
    file = JSON.parse(raw) as RecoveryFile;
  } catch {
    throw new Error("Not a CBM recovery file");
  }
  if (file?.format !== "cbm-recovery" || file.version !== 1) {
    throw new Error("Not a CBM recovery file (unknown format/version)");
  }
  if (!file.masterKey || !file.dump) throw new Error("Recovery file is incomplete");
  return file;
}

/** Guards evaluated before a destructive import. */
export async function importGuards(file: { migrationId: string; cbmVersion: string }): Promise<{ error?: UserError }> {
  // Version guard: refuse a dump newer than this build (older rolls forward
  // via `prisma migrate deploy` at next startup).
  if (file.migrationId !== "unknown") {
    const local = await localMigrationIds();
    if (local.size > 0 && !local.has(file.migrationId)) {
      return {
        error: new UserError("messages.recoveryNewerVersion", { migration: file.migrationId, version: file.cbmVersion }),
      };
    }
  }
  return {};
}

/** Is this install still "fresh" (safe to overwrite without an override)? */
export async function isEmptyish(): Promise<boolean> {
  const [instances, destinations] = await Promise.all([
    prisma.coolifyInstance.count(),
    prisma.destination.count(),
  ]);
  return instances === 0 && destinations === 0;
}

/**
 * Import: fetch the LATEST self-backup via the seed, else use the embedded
 * dump (also when the latest one doesn't decrypt with the file's key - another
 * install may have written there), pg_restore it over this install's DB, then
 * re-encrypt every secret under THIS install's master key (the file's key is
 * never adopted). Schedules, the self-backup and alerts stay on hold until an
 * admin resumes them (see lib/recovery-hold): a test import must not take over
 * production's self-backup or run its schedules. Returns the dump used.
 */
export async function importRecoveryFile(file: OpenedRecovery): Promise<{ source: "latest" | "embedded" }> {
  const oldKey = Buffer.from(file.masterKey, "base64");
  if (oldKey.length !== 32) throw new Error("Recovery file carries an invalid master key");

  const stage = await mkdtemp(join(tmpdir(), "cbm-import-"));
  try {
    // 1. The freshest dump we can reach and read.
    const plain = join(stage, "metadata.dump");
    let source: "latest" | "embedded" | null = null;
    if (file.selfBackup) {
      const enc = join(stage, "latest.dump.enc");
      try {
        await downloadFileFromDestination(file.selfBackup.destination, file.selfBackup.path, enc);
        await decryptFileWithKey(enc, plain, oldKey);
        source = "latest";
      } catch (e) {
        console.warn(`[recovery/import] the latest self-backup can't be used (${(e as Error).message}): using the embedded dump`);
      }
    }
    if (!source) {
      if (!file.embedded) throw new UserError("messages.recoveryLatestUnreachable");
      if ("plain" in file.embedded) await writeFile(plain, file.embedded.plain);
      else {
        const enc = join(stage, "embedded.dump.enc");
        await writeFile(enc, file.embedded.encrypted);
        await decryptFileWithKey(enc, plain, oldKey);
      }
      source = "embedded";
    }

    // 2. Restore over this database.
    await pgRestore(plain);

    // 3. Re-encrypt every master-key secret under THIS install's env key.
    await reencryptAllSecrets(oldKey);
    // TOTP secrets are encrypted with the OLD install's auth secret, which the
    // recovery file doesn't carry: turn two-factor off for everyone so nobody
    // is locked out. Accounts the policy requires it from set it up again at
    // their next sign-in.
    await resetTwoFactor();

    // 4. Refresh bookkeeping so the staleness check reflects THIS install, and
    // hold everything that acts on production until an admin resumes it.
    // (Upserted: the restored database may have no settings row yet - the
    // hold must never be skipped.)
    const after = { recoveryFileKeyFp: masterKeyFingerprint(), recoveryHoldSince: new Date() };
    await prisma.setting.upsert({ where: { id: "global" }, create: { id: "global", ...after }, update: after });

    return { source };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

/** pg_restore a custom-format dump over the controller DB (drops + recreates). */
async function pgRestore(dumpFile: string): Promise<void> {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not set");
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      "pg_restore",
      ["--clean", "--if-exists", "--no-owner", "--dbname", env.databaseUrl, dumpFile],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("error", (e) =>
      reject(
        (e as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error("pg_restore not found - the controller image needs the postgresql client tools")
          : e,
      ),
    );
    // pg_restore exits 1 on ignorable warnings with --clean; treat hard failures only.
    p.on("close", (code) =>
      code === 0 || (code === 1 && !/FATAL|could not connect/i.test(err))
        ? resolve()
        : reject(new Error(`pg_restore exited ${code}: ${err.slice(0, 400)}`)),
    );
  });
}

/**
 * Re-encrypt every master-key-encrypted secret from `oldKey` to the current
 * env master key: instance API tokens, destination configs/keys/restic
 * passwords, resources' dump passwords, the SMTP password, and the encrypted fields inside every
 * snapshot manifest (envEnc + capturedConfig.dbCredsEnc/composeEnc) — without
 * these, restores and restic repos would be unreadable after the key change.
 */
async function reencryptAllSecrets(oldKey: Buffer): Promise<void> {
  const re = (blob: string) => encryptSecret(decryptSecretWithKey(blob, oldKey));

  for (const i of await prisma.coolifyInstance.findMany()) {
    await prisma.coolifyInstance.update({ where: { id: i.id }, data: { apiTokenEnc: re(i.apiTokenEnc) } });
  }
  for (const d of await prisma.destination.findMany()) {
    await prisma.destination.update({
      where: { id: d.id },
      data: {
        configEnc: re(d.configEnc),
        encryptionKeyEnc: d.encryptionKeyEnc ? re(d.encryptionKeyEnc) : null,
        resticPasswordEnc: d.resticPasswordEnc ? re(d.resticPasswordEnc) : null,
      },
    });
  }
  // Single sign-on client secrets.
  for (const p of await prisma.ssoProvider.findMany({ where: { clientSecretEnc: { not: null } }, select: { id: true, clientSecretEnc: true } })) {
    await prisma.ssoProvider.update({ where: { id: p.id }, data: { clientSecretEnc: re(p.clientSecretEnc!) } });
  }
  // Dump logins set on resources.
  for (const r of await prisma.resource.findMany({
    where: { dumpPasswordEnc: { not: null } },
    select: { id: true, dumpPasswordEnc: true },
  })) {
    await prisma.resource.update({ where: { id: r.id }, data: { dumpPasswordEnc: re(r.dumpPasswordEnc!) } });
  }
  const setting = await prisma.setting.findUnique({ where: { id: "global" } });
  if (setting?.smtpPasswordEnc) {
    await prisma.setting.update({ where: { id: "global" }, data: { smtpPasswordEnc: re(setting.smtpPasswordEnc) } });
  }
  // Environment variables stored apart (lib/env-blobs).
  await reencryptEnvBlobs(re, (blob) => decryptSecretWithKey(blob, oldKey));
  // Snapshot manifests carry their own encrypted blobs.
  const snapshots = await prisma.snapshot.findMany({ where: { manifest: { not: undefined } } });
  for (const snap of snapshots) {
    const manifest = snap.manifest as unknown as SnapshotManifest | null;
    if (!manifest) continue;
    let changed = false;
    if (manifest.envEnc) {
      manifest.envEnc = re(manifest.envEnc);
      changed = true;
    }
    if (manifest.capturedConfig?.dbCredsEnc) {
      manifest.capturedConfig.dbCredsEnc = re(manifest.capturedConfig.dbCredsEnc);
      changed = true;
    }
    if (manifest.capturedConfig?.composeEnc) {
      manifest.capturedConfig.composeEnc = re(manifest.capturedConfig.composeEnc);
      changed = true;
    }
    if (changed) {
      await prisma.snapshot.update({ where: { id: snap.id }, data: { manifest: manifest as unknown as object } });
    }
  }
}
