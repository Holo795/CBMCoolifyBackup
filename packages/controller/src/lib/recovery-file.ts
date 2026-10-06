import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedDestination, SnapshotManifest } from "@cbm/shared";
import { prisma } from "./prisma";
import { env } from "./env";
import { UserError } from "./user-error";
import {
  masterKeyB64,
  masterKeyFingerprint,
  encryptFileWithKey,
  decryptFileWithKey,
  decryptSecretWithKey,
  encryptSecret,
} from "./crypto";
import { resolveDestination } from "./jobs";
import { dumpMetadataDb, downloadFileFromDestination, SELF_BACKUP_PATH } from "./self-backup";
import { version as CBM_VERSION } from "../../package.json";
import { resetTwoFactor } from "./two-factor";

/**
 * The recovery file: a single, self-sufficient bootstrap seed held by the
 * operator OUT of band. It carries the master key, the self-backup
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

/** Build the recovery file content + bump the generation bookkeeping. */
export async function buildRecoveryFile(): Promise<{ filename: string; content: string }> {
  const setting = await prisma.setting.findUnique({ where: { id: "global" } });

  // The seed's whole point is reaching the LATEST self-backup — carry the
  // destination resolved (decrypted) so a fresh CBM can dial it directly.
  let selfBackup: RecoveryFile["selfBackup"] = null;
  if (setting?.selfBackupEnabled && setting.selfBackupDestinationId) {
    const dest = await prisma.destination.findUnique({ where: { id: setting.selfBackupDestinationId } });
    if (dest && dest.type !== "local") {
      selfBackup = { destination: resolveDestination(dest), path: SELF_BACKUP_PATH };
    }
  }

  // Embedded fallback dump (encrypted with the master key that's in the file).
  const stage = await mkdtemp(join(tmpdir(), "cbm-recovery-"));
  let dumpB64: string;
  try {
    const plain = join(stage, "metadata.dump");
    const enc = join(stage, "metadata.dump.enc");
    await dumpMetadataDb(plain);
    await encryptFileWithKey(plain, enc);
    dumpB64 = (await readFile(enc)).toString("base64");
  } finally {
    await rm(stage, { recursive: true, force: true });
  }

  const generation = (setting?.recoveryFileGeneration ?? 0) + 1;
  const file: RecoveryFile = {
    format: "cbm-recovery",
    version: 1,
    generation,
    createdAt: new Date().toISOString(),
    cbmVersion: CBM_VERSION,
    migrationId: await latestMigrationId(),
    masterKey: masterKeyB64(),
    selfBackup,
    dump: dumpB64,
  };

  // Bookkeeping for the reveal-once model + the staleness warning.
  await prisma.setting.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      recoveryFileGeneration: generation,
      recoveryFileAt: new Date(),
      recoveryFileDestId: setting?.selfBackupDestinationId ?? null,
      recoveryFileKeyFp: masterKeyFingerprint(),
    },
    update: {
      recoveryFileGeneration: generation,
      recoveryFileAt: new Date(),
      recoveryFileDestId: setting?.selfBackupDestinationId ?? null,
      recoveryFileKeyFp: masterKeyFingerprint(),
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  return { filename: `cbm-recovery-g${generation}-${date}.json`, content: JSON.stringify(file) };
}

/** Parse + sanity-check an uploaded recovery file. */
export function parseRecoveryFile(raw: string): RecoveryFile {
  let file: RecoveryFile;
  try {
    file = JSON.parse(raw) as RecoveryFile;
  } catch {
    throw new Error("Not a CBM recovery file (invalid JSON)");
  }
  if (file?.format !== "cbm-recovery" || file.version !== 1) {
    throw new Error("Not a CBM recovery file (unknown format/version)");
  }
  if (!file.masterKey || !file.dump) throw new Error("Recovery file is incomplete");
  return file;
}

/** Guards evaluated before a destructive import. */
export async function importGuards(file: RecoveryFile): Promise<{ error?: UserError }> {
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
 * Import: fetch the LATEST self-backup via the seed (fallback: the embedded
 * dump), pg_restore it over this install's DB, then re-encrypt every secret
 * under THIS install's master key (the file's key is never adopted — restarts
 * keep working with the env key). Returns which dump source was used.
 */
export async function importRecoveryFile(file: RecoveryFile): Promise<{ source: "latest" | "embedded" }> {
  const oldKey = Buffer.from(file.masterKey, "base64");
  if (oldKey.length !== 32) throw new Error("Recovery file carries an invalid master key");

  const stage = await mkdtemp(join(tmpdir(), "cbm-import-"));
  try {
    // 1. Get the freshest dump we can reach.
    const enc = join(stage, "metadata.dump.enc");
    let source: "latest" | "embedded" = "embedded";
    if (file.selfBackup) {
      try {
        await downloadFileFromDestination(file.selfBackup.destination, file.selfBackup.path, enc);
        source = "latest";
      } catch {
        /* destination unreachable — use the embedded point-in-time dump */
      }
    }
    if (source === "embedded") await writeFile(enc, Buffer.from(file.dump, "base64"));

    // 2. Decrypt with the FILE's key and restore over this database.
    const plain = join(stage, "metadata.dump");
    await decryptFileWithKey(enc, plain, oldKey);
    await pgRestore(plain);

    // 3. Re-encrypt every master-key secret under THIS install's env key.
    await reencryptAllSecrets(oldKey);
    // TOTP secrets are encrypted with the OLD install's auth secret, which the
    // recovery file doesn't carry: turn two-factor off for everyone so nobody
    // is locked out. Accounts the policy requires it from set it up again at
    // their next sign-in.
    await resetTwoFactor();

    // 4. Refresh bookkeeping so the staleness check reflects THIS install.
    await prisma.setting
      .update({ where: { id: "global" }, data: { recoveryFileKeyFp: masterKeyFingerprint() } })
      .catch(() => undefined);

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
 * passwords, the SMTP password, and the encrypted fields inside every
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
  const setting = await prisma.setting.findUnique({ where: { id: "global" } });
  if (setting?.smtpPasswordEnc) {
    await prisma.setting.update({ where: { id: "global" }, data: { smtpPasswordEnc: re(setting.smtpPasswordEnc) } });
  }
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
