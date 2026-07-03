import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { Writable } from "node:stream";
import { env } from "./env";

/**
 * Secret-at-rest encryption for the controller DB (API tokens, SSH/S3 creds,
 * per-destination AES keys). Uses AES-256-GCM with a master key.
 *
 * Master key: MASTER_KEY (base64, 32 bytes) if provided, else derived from
 * BETTER_AUTH_SECRET via SHA-256 (so a dev setup works out of the box).
 */
function masterKey(): Buffer {
  if (env.masterKey) {
    const k = Buffer.from(env.masterKey, "base64");
    if (k.length === 32) return k;
  }
  return createHash("sha256").update(env.authSecret).digest();
}

/** Encrypt a UTF-8 string -> base64 blob ("iv.tag.ciphertext"). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

/** Decrypt a blob produced by encryptSecret back to a UTF-8 string. */
export function decryptSecret(blob: string): string {
  return decryptSecretWithKey(blob, masterKey());
}

/** decryptSecret with an explicit key — used by the recovery-file import to
 * read secrets encrypted under the ORIGINAL install's master key. */
export function decryptSecretWithKey(blob: string, key: Buffer): string {
  const [ivB64, tagB64, ctB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed secret blob");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

/** Generate a fresh base64 32-byte AES key (for per-destination encryption). */
export function generateAesKeyB64(): string {
  return randomBytes(32).toString("base64");
}

/** SHA-256 hex of a token (for storing agent tokens without plaintext). */
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Random opaque token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Base64 of the active master key (embedded in the recovery file). */
export function masterKeyB64(): string {
  return masterKey().toString("base64");
}

/** Sha256 fingerprint of the active master key — safe to store/compare for the
 * recovery-file staleness check without revealing the key. */
export function masterKeyFingerprint(): string {
  return createHash("sha256").update(masterKey()).digest("hex");
}

/* ------------------- streamed file encryption (master key) ------------------- *
 * Same layout as the agent's artifact encryption: [IV(12)] [ciphertext] [TAG(16)].
 * Used for the self-backup dump and the recovery file. `key` defaults to the
 * master key; pass one explicitly to decrypt with a recovery file's key.
 * ----------------------------------------------------------------------------- */

const IV_LEN = 12;
const TAG_LEN = 16;

function writeChunk(out: Writable, buf: Buffer): Promise<void> {
  return new Promise((resolve, reject) => out.write(buf, (err) => (err ? reject(err) : resolve())));
}

export async function encryptFileWithKey(src: string, dest: string, key: Buffer = masterKey()): Promise<void> {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const out = createWriteStream(dest);
  await writeChunk(out, iv);
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await writeChunk(out, cipher.getAuthTag());
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
}

export async function decryptFileWithKey(src: string, dest: string, key: Buffer = masterKey()): Promise<void> {
  const { size } = await stat(src);
  if (size < IV_LEN + TAG_LEN) throw new Error("Encrypted file is too small to be valid");
  const iv = await readSlice(src, 0, IV_LEN);
  const tag = await readSlice(src, size - TAG_LEN, size);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  await pipeline(createReadStream(src, { start: IV_LEN, end: size - TAG_LEN - 1 }), decipher, createWriteStream(dest));
}

async function readSlice(path: string, start: number, end: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of createReadStream(path, { start, end: end - 1 })) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
