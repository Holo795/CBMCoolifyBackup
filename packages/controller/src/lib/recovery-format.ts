import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb, type ScryptOptions } from "node:crypto";
import zlib from "node:zlib";

/**
 * The recovery file's format (2.8.0, version 2). Everything secret in it - the
 * master key, the self-backup destination's credentials, the embedded dump -
 * is encrypted with a key derived from a passphrase the admin chooses (scrypt,
 * memory-hard), so the file alone is useless to whoever finds it. Before, it
 * was a JSON file holding the master key in clear.
 *
 *   "CBMRECOVERY" 0x02 | u32 header length | header (JSON, clear) |
 *   IV (12) | AES-256-GCM ciphertext | tag (16)
 *
 * The header says what the file is (generation, versions, light or full, the
 * KDF parameters) and is authenticated with the ciphertext. The plaintext,
 * compressed (zstd, gzip where Node has no zstd), is:
 *
 *   u32 secrets length | secrets (JSON: master key, self-backup) | dump bytes
 *
 * A "light" file has no dump: it reaches the self-backup, which is always
 * current. A "full" one also embeds the database at the time it was made.
 */
export const MAGIC = Buffer.from("CBMRECOVERY\x02", "latin1");
export const MIN_PASSPHRASE = 12;

export type RecoveryKind = "light" | "full";

export interface RecoveryHeader {
  format: "cbm-recovery";
  version: 2;
  kind: RecoveryKind;
  generation: number;
  createdAt: string;
  cbmVersion: string;
  migrationId: string;
  compression: "zstd" | "gzip";
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
}

export interface RecoverySecrets {
  masterKey: string;
  selfBackup: { destination: unknown; path: string } | null;
}

const KDF = { N: 2 ** 17, r: 8, p: 1 };

function scrypt(passphrase: string, salt: Buffer, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { N: opts.N, r: opts.r, p: opts.p, maxmem: 512 * 1024 * 1024 };
  return new Promise((resolve, reject) => scryptCb(passphrase.normalize("NFC"), salt, 32, options, (e, k) => (e ? reject(e) : resolve(k))));
}

/** Why a passphrase is refused, or null. */
export function passphraseProblem(p: string): "tooShort" | null {
  return [...p.normalize("NFC")].length < MIN_PASSPHRASE ? "tooShort" : null;
}

const hasZstd = typeof (zlib as { zstdCompressSync?: unknown }).zstdCompressSync === "function";

function compress(buf: Buffer): { data: Buffer; compression: "zstd" | "gzip" } {
  if (hasZstd) return { data: zlib.zstdCompressSync(buf), compression: "zstd" };
  return { data: zlib.gzipSync(buf), compression: "gzip" };
}

function decompress(buf: Buffer, compression: string): Buffer {
  if (compression === "zstd") {
    if (!hasZstd) throw new Error("This Node.js can't read zstd: run CBM's image to import this file");
    return zlib.zstdDecompressSync(buf);
  }
  if (compression === "gzip") return zlib.gunzipSync(buf);
  throw new Error(`Unknown compression: ${compression}`);
}

export async function encodeRecoveryFile(
  meta: Omit<RecoveryHeader, "format" | "version" | "compression" | "kdf">,
  secrets: RecoverySecrets,
  dump: Buffer | null,
  passphrase: string,
  kdf = KDF,
): Promise<Buffer> {
  const secretJson = Buffer.from(JSON.stringify(secrets));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(secretJson.length);
  const { data, compression } = compress(Buffer.concat([len, secretJson, dump ?? Buffer.alloc(0)]));
  const salt = randomBytes(16);
  const header: RecoveryHeader = {
    format: "cbm-recovery",
    version: 2,
    ...meta,
    compression,
    kdf: { name: "scrypt", ...kdf, salt: salt.toString("base64") },
  };
  const headerBuf = Buffer.from(JSON.stringify(header));
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32BE(headerBuf.length);
  const key = await scrypt(passphrase, salt, kdf);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(headerBuf);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, headerLen, headerBuf, iv, ct, cipher.getAuthTag()]);
}

export function isRecoveryV2(buf: Buffer): boolean {
  return buf.length > MAGIC.length + 4 && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

/** The clear header (to show what a file is before asking for its passphrase). */
export function readRecoveryHeader(buf: Buffer): RecoveryHeader {
  if (!isRecoveryV2(buf)) throw new Error("Not a CBM recovery file (version 2)");
  const len = buf.readUInt32BE(MAGIC.length);
  if (len > 64 * 1024 || MAGIC.length + 4 + len > buf.length) throw new Error("Recovery file is damaged (header)");
  const header = JSON.parse(buf.subarray(MAGIC.length + 4, MAGIC.length + 4 + len).toString("utf8")) as RecoveryHeader;
  if (header.format !== "cbm-recovery" || header.version !== 2 || header.kdf?.name !== "scrypt") {
    throw new Error("Not a CBM recovery file (unknown format/version)");
  }
  return header;
}

/** Decrypt a version 2 file. A wrong passphrase (or a damaged file) throws "wrong passphrase". */
export async function decodeRecoveryFile(
  buf: Buffer,
  passphrase: string,
): Promise<{ header: RecoveryHeader; secrets: RecoverySecrets; dump: Buffer | null }> {
  const header = readRecoveryHeader(buf);
  const start = MAGIC.length + 4 + buf.readUInt32BE(MAGIC.length);
  const headerBuf = buf.subarray(MAGIC.length + 4, start);
  const iv = buf.subarray(start, start + 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(start + 12, buf.length - 16);
  // Bounded: a crafted header mustn't make the server burn gigabytes.
  const { N, r, p } = header.kdf;
  if (!(N >= 2 ** 14 && N <= 2 ** 18 && r >= 1 && r <= 16 && p >= 1 && p <= 4 && 128 * N * r <= 256 * 1024 * 1024)) {
    throw new Error("Recovery file is damaged (KDF)");
  }
  const key = await scrypt(passphrase, Buffer.from(header.kdf.salt, "base64"), { N, r, p });
  let plain: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(headerBuf);
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new RecoveryPassphraseError();
  }
  const body = decompress(plain, header.compression);
  const secretLen = body.readUInt32BE(0);
  const secrets = JSON.parse(body.subarray(4, 4 + secretLen).toString("utf8")) as RecoverySecrets;
  const dump = body.length > 4 + secretLen ? body.subarray(4 + secretLen) : null;
  return { header, secrets, dump };
}

export class RecoveryPassphraseError extends Error {
  constructor() {
    super("Wrong passphrase (or the file is damaged)");
  }
}
