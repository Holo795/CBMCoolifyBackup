import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MirrorJob, SnapshotManifest } from "@cbm/shared";
import { runMirror } from "../src/mirror.js";
import { encryptFile, decryptFile, generateKeyB64, sha256File } from "../src/crypto.js";

const noop = () => {};

function manifest(artifact: { filename: string; sha256: string; encrypted: boolean }): SnapshotManifest {
  return {
    version: 1,
    resource: { coolifyUuid: "res1", name: "r", type: "application", containerNames: [], volumes: [], bindMounts: [] },
    mode: "backup",
    captureMode: "frozen",
    capturedAt: new Date().toISOString(),
    artifacts: [{ kind: "volume", filename: artifact.filename, sizeBytes: 1, sha256: artifact.sha256, encrypted: artifact.encrypted, meta: {} }],
    provenance: {},
    encrypted: artifact.encrypted,
    destinationDir: "snap1",
  } as unknown as SnapshotManifest;
}

function job(srcBase: string, tgtBase: string, m: SnapshotManifest, keys: { source?: string; target?: string }): MirrorJob {
  return {
    id: "m1",
    type: "mirror",
    source: { type: "local", basePath: srcBase },
    target: { type: "local", basePath: tgtBase },
    sourceStorage: { engine: "tar" },
    targetStorage: { engine: "tar" },
    dir: "snap1",
    sourceEncryptionKey: keys.source,
    targetEncryptionKey: keys.target,
    manifest: m,
  } as MirrorJob;
}

/** Stage a source snapshot (plaintext or encrypted) and return its manifest. */
async function makeSource(srcBase: string, content: Buffer, key?: string): Promise<SnapshotManifest> {
  const snap = join(srcBase, "snap1");
  await mkdir(snap, { recursive: true });
  const plain = join(snap, "__plain");
  await writeFile(plain, content);
  const sha = await sha256File(plain);
  if (key) {
    await encryptFile(plain, join(snap, "data.bin.enc"), key);
    await rm(plain, { force: true });
    return manifest({ filename: "data.bin.enc", sha256: sha, encrypted: true });
  }
  await writeFile(join(snap, "data.bin"), content);
  await rm(plain, { force: true });
  return manifest({ filename: "data.bin", sha256: sha, encrypted: false });
}

test("mirror re-keys an encrypted tar snapshot from source key A to target key B", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-mirror-"));
  try {
    const src = join(dir, "src");
    const tgt = join(dir, "tgt");
    const work = join(dir, "work");
    await mkdir(work, { recursive: true });
    const keyA = generateKeyB64();
    const keyB = generateKeyB64();
    const content = Buffer.from("mirror me ".repeat(100));
    const m = await makeSource(src, content, keyA);

    const r = await runMirror(job(src, tgt, m, { source: keyA, target: keyB }), work, noop);

    // The target copy is encrypted with key B and named .enc.
    assert.equal(r.manifest.artifacts[0].filename, "data.bin.enc");
    assert.equal(r.manifest.artifacts[0].encrypted, true);
    const stored = join(tgt, "snap1", "data.bin.enc");
    assert.ok((await stat(stored)).size > 0);
    // It decrypts with key B back to the original plaintext.
    const dec = join(dir, "dec");
    await decryptFile(stored, dec, keyB);
    assert.ok((await readFile(dec)).equals(content));
    // The manifest was copied too.
    assert.ok((await stat(join(tgt, "snap1", "manifest.json"))).size > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mirror from an encrypted source to an unencrypted target stores plaintext", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-mirror-"));
  try {
    const src = join(dir, "src");
    const tgt = join(dir, "tgt");
    const work = join(dir, "work");
    await mkdir(work, { recursive: true });
    const keyA = generateKeyB64();
    const content = Buffer.from("plain target");
    const m = await makeSource(src, content, keyA);

    const r = await runMirror(job(src, tgt, m, { source: keyA /* no target key */ }), work, noop);

    assert.equal(r.manifest.artifacts[0].filename, "data.bin");
    assert.equal(r.manifest.artifacts[0].encrypted, false);
    assert.ok((await readFile(join(tgt, "snap1", "data.bin"))).equals(content));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mirror a plaintext tar snapshot copies it verbatim", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-mirror-"));
  try {
    const src = join(dir, "src");
    const tgt = join(dir, "tgt");
    const work = join(dir, "work");
    await mkdir(work, { recursive: true });
    const content = Buffer.from("just copy me");
    const m = await makeSource(src, content); // plaintext source

    const r = await runMirror(job(src, tgt, m, {}), work, noop);

    assert.equal(r.manifest.artifacts[0].encrypted, false);
    assert.ok((await readFile(join(tgt, "snap1", "data.bin"))).equals(content));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
