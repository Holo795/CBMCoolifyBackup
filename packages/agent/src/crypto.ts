import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { Transform, type Writable } from "node:stream";

const IV_LEN = 12;
const TAG_LEN = 16;

/** Generate a fresh base64-encoded 32-byte key. */
export function generateKeyB64(): string {
  return randomBytes(32).toString("base64");
}

function keyFromB64(b64: string): Buffer {
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("Encryption key must decode to 32 bytes");
  return k;
}

/** Compute the sha256 of a file (hex). */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const rs = createReadStream(path);
  rs.pipe(hash, { end: false });
  await once(rs, "end");
  return hash.digest("hex");
}

/**
 * Encrypt src -> dest using AES-256-GCM.
 * Output layout: [IV(12)] [ciphertext...] [TAG(16)]
 */
export async function encryptFile(src: string, dest: string, keyB64: string): Promise<void> {
  const key = keyFromB64(keyB64);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const out = createWriteStream(dest);
  // The cipher is a Transform stream; piping through it gives correct
  // backpressure and error propagation (important for multi-GB volume tarballs).
  await writeChunk(out, iv); // IV header before the ciphertext
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await writeChunk(out, cipher.getAuthTag()); // GCM tag trailer, valid after final()
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
}

/** Write one buffer to a stream, honouring backpressure and surfacing errors. */
function writeChunk(out: Writable, buf: Buffer): Promise<void> {
  return new Promise((resolve, reject) => out.write(buf, (err) => (err ? reject(err) : resolve())));
}

/**
 * Decrypt src -> dest. Reads IV from head and TAG from tail, streams the middle.
 */
export async function decryptFile(src: string, dest: string, keyB64: string): Promise<void> {
  const key = keyFromB64(keyB64);
  const size = (await stat(src)).size;
  if (size < IV_LEN + TAG_LEN) throw new Error("Encrypted file too small");

  const iv = await readRange(src, 0, IV_LEN - 1);
  const tag = await readRange(src, size - TAG_LEN, size - 1);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  // Empty plaintext (IV + tag only): nothing to stream, but the tag must still
  // be checked (final() throws on a mismatch).
  if (size === IV_LEN + TAG_LEN) {
    const empty = Buffer.concat([decipher.update(Buffer.alloc(0)), decipher.final()]);
    await writeFile(dest, empty);
    return;
  }
  // Stream the ciphertext (between IV and tag) through the decipher with proper
  // backpressure; decipher.final() throws on a tag mismatch, rejecting pipeline.
  await pipeline(
    createReadStream(src, { start: IV_LEN, end: size - TAG_LEN - 1 }),
    decipher,
    createWriteStream(dest),
  );
}

async function readRange(path: string, start: number, end: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const rs = createReadStream(path, { start, end });
  for await (const c of rs) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/**
 * AES-256-GCM as a stream, same layout as encryptFile ([IV(12)] [ciphertext]
 * [TAG(16)]), so a volume can be encrypted while it is copied - no plaintext
 * copy on disk and no second pass.
 */
export function encryptStream(keyB64: string): Transform {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", keyFromB64(keyB64), iv);
  let started = false;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (!started) {
        started = true;
        this.push(iv);
      }
      cb(null, cipher.update(chunk));
    },
    flush(cb) {
      if (!started) this.push(iv);
      this.push(cipher.final());
      cb(null, cipher.getAuthTag());
    },
  });
}

/** Pass-through that hashes (sha256) and counts what goes through it. */
export class HashCounter extends Transform {
  private readonly hash = createHash("sha256");
  bytes = 0;
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null, d?: Buffer) => void) {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    cb(null, chunk);
  }
  digest(): string {
    return this.hash.digest("hex");
  }
}
