import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VerifyDestinationJob } from "@cbm/shared";
import { runVerifyDestination } from "../src/verify.js";
import { encryptFile, generateKeyB64, sha256File } from "../src/crypto.js";

const noop = () => {};

/** Build a verify job against a local destination directory. */
function job(basePath: string, dirs: string[], extra: Partial<VerifyDestinationJob> = {}): VerifyDestinationJob {
  return {
    id: "j1",
    type: "verify-destination",
    destination: { type: "local", basePath },
    storage: { engine: "tar" },
    dirs,
    deep: true,
    ...extra,
  } as VerifyDestinationJob;
}

/** Write a snapshot dir with a manifest + one artifact; returns its sha. */
async function makeSnapshot(base: string, dir: string, artifact: { filename: string; content: Buffer; encrypted?: boolean; key?: string }) {
  const snapDir = join(base, dir);
  await mkdir(snapDir, { recursive: true });
  const plain = join(snapDir, "__plain.tmp");
  await writeFile(plain, artifact.content);
  const sha = await sha256File(plain);
  const stored = join(snapDir, artifact.filename);
  if (artifact.encrypted) {
    await encryptFile(plain, stored, artifact.key!);
    await rm(plain, { force: true });
  } else {
    await writeFile(stored, artifact.content);
    await rm(plain, { force: true });
  }
  await writeFile(
    join(snapDir, "manifest.json"),
    JSON.stringify({ artifacts: [{ filename: artifact.filename, sha256: sha, encrypted: !!artifact.encrypted }] }),
  );
  return sha;
}

test("deep check: a healthy plaintext tar snapshot is present, not corrupt", async () => {
  const base = await mkdtemp(join(tmpdir(), "cbm-verify-"));
  try {
    await makeSnapshot(base, "snap1", { filename: "data.bin", content: Buffer.from("hello world".repeat(100)) });
    const r = await runVerifyDestination(job(base, ["snap1"]), noop);
    assert.deepEqual(r.present, ["snap1"]);
    assert.deepEqual(r.corrupt, []);
    assert.deepEqual(r.missing, []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("deep check: a corrupted plaintext artifact is flagged corrupt (sha mismatch)", async () => {
  const base = await mkdtemp(join(tmpdir(), "cbm-verify-"));
  try {
    await makeSnapshot(base, "snap1", { filename: "data.bin", content: Buffer.from("original content here") });
    // Corrupt the stored artifact after the manifest recorded its sha.
    await writeFile(join(base, "snap1", "data.bin"), Buffer.from("TAMPERED content here"));
    const r = await runVerifyDestination(job(base, ["snap1"]), noop);
    assert.deepEqual(r.corrupt, ["snap1"]);
    assert.deepEqual(r.present, []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("deep check: an encrypted artifact that decrypts cleanly is present", async () => {
  const base = await mkdtemp(join(tmpdir(), "cbm-verify-"));
  try {
    const key = generateKeyB64();
    await makeSnapshot(base, "enc1", { filename: "data.enc", content: Buffer.from("secret payload".repeat(50)), encrypted: true, key });
    const r = await runVerifyDestination(job(base, ["enc1"], { decryptionKey: key }), noop);
    assert.deepEqual(r.present, ["enc1"]);
    assert.deepEqual(r.corrupt, []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("deep check: a corrupted encrypted artifact fails the GCM tag and is corrupt", async () => {
  const base = await mkdtemp(join(tmpdir(), "cbm-verify-"));
  try {
    const key = generateKeyB64();
    await makeSnapshot(base, "enc1", { filename: "data.enc", content: Buffer.from("secret payload"), encrypted: true, key });
    // Flip a byte in the ciphertext middle so the GCM auth tag check fails.
    const enc = join(base, "enc1", "data.enc");
    const buf = await readFile(enc);
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    await writeFile(enc, buf);
    const r = await runVerifyDestination(job(base, ["enc1"], { decryptionKey: key }), noop);
    assert.deepEqual(r.corrupt, ["enc1"]);
    assert.deepEqual(r.present, []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("a missing manifest is reported missing (presence), deep or not", async () => {
  const base = await mkdtemp(join(tmpdir(), "cbm-verify-"));
  try {
    const r = await runVerifyDestination(job(base, ["ghost"]), noop);
    assert.deepEqual(r.missing, ["ghost"]);
    assert.deepEqual(r.present, []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("non-deep check reports presence only, ignoring content corruption", async () => {
  const base = await mkdtemp(join(tmpdir(), "cbm-verify-"));
  try {
    await makeSnapshot(base, "snap1", { filename: "data.bin", content: Buffer.from("content") });
    await writeFile(join(base, "snap1", "data.bin"), Buffer.from("CORRUPTED"));
    const r = await runVerifyDestination(job(base, ["snap1"], { deep: false }), noop);
    assert.deepEqual(r.present, ["snap1"]); // present (manifest exists); corruption not checked
    assert.deepEqual(r.corrupt, []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
