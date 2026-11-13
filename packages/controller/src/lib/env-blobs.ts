import { createHmac } from "node:crypto";
import type { SnapshotManifest } from "@cbm/shared";
import { prisma } from "./prisma";
import { decryptSecret, masterKeyB64 } from "./crypto";

/**
 * A resource's environment variables, captured with each of its backups for a
 * clone, were stored in every snapshot's manifest: the same few kilobytes
 * hundreds of times (most of the database, and of the recovery file). They are
 * stored once per distinct content now, and snapshots point at them.
 */

/** HMAC of the plaintext, keyed by the master key. */
export function envDigest(plain: string, key = Buffer.from(masterKeyB64(), "base64")): string {
  return createHmac("sha256", key).update(plain).digest("hex");
}

/** The blob for this (encrypted) content, created when new. */
export async function storeEnv(envEnc: string): Promise<string> {
  const plain = decryptSecret(envEnc);
  const digest = envDigest(plain);
  const blob = await prisma.envBlob.upsert({ where: { digest }, create: { digest, envEnc }, update: {}, select: { id: true } });
  return blob.id;
}

/** A manifest as stored: without its env, which goes to a blob. */
export async function splitManifestEnv(
  m: SnapshotManifest,
): Promise<{ manifest: SnapshotManifest; envBlobId: string | null }> {
  if (!m.envEnc) return { manifest: m, envBlobId: null };
  const { envEnc, ...rest } = m;
  try {
    return { manifest: rest as SnapshotManifest, envBlobId: await storeEnv(envEnc) };
  } catch {
    // Not decryptable here (shouldn't happen): keep it in the manifest as before.
    return { manifest: m, envBlobId: null };
  }
}

/** A stored manifest with its env back (for a clone). */
export async function manifestWithEnv(m: SnapshotManifest, envBlobId: string | null): Promise<SnapshotManifest> {
  if (m.envEnc || !envBlobId) return m;
  const blob = await prisma.envBlob.findUnique({ where: { id: envBlobId }, select: { envEnc: true } });
  return blob ? { ...m, envEnc: blob.envEnc } : m;
}

/**
 * Move the env of snapshots stored before into blobs, a batch at a time
 * (runs in the background until none is left). Returns how many moved.
 */
export async function dedupeStoredEnvs(batch = 200): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Snapshot" WHERE manifest ? 'envEnc' LIMIT ${batch}`;
  let moved = 0;
  for (const { id } of rows) {
    const snap = await prisma.snapshot.findUnique({ where: { id }, select: { manifest: true } });
    const m = snap?.manifest as unknown as SnapshotManifest | null;
    if (!m?.envEnc) continue;
    const { manifest, envBlobId } = await splitManifestEnv(m);
    if (!envBlobId) continue;
    await prisma.snapshot.update({ where: { id }, data: { manifest: manifest as unknown as object, envBlobId } });
    moved++;
  }
  return moved;
}

/** Blobs no snapshot points at anymore. */
export async function removeUnusedEnvBlobs(): Promise<number> {
  const { count } = await prisma.envBlob.deleteMany({ where: { snapshots: { none: {} } } });
  return count;
}

/** After an import under another master key: re-encrypt and re-key every blob. */
export async function reencryptEnvBlobs(re: (blob: string) => string, decryptOld: (blob: string) => string): Promise<void> {
  for (const b of await prisma.envBlob.findMany({ select: { id: true, envEnc: true } })) {
    const plain = decryptOld(b.envEnc);
    await prisma.envBlob.update({ where: { id: b.id }, data: { envEnc: re(b.envEnc), digest: envDigest(plain) } });
  }
}

