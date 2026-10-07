import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { captureTar } from "../src/capture.js";
import { encryptStream, decryptFile, generateKeyB64, sha256File, HashCounter } from "../src/crypto.js";
import { docker, pathSizeBytes, restoreVolume } from "../src/docker.js";
import { makeTransfer } from "../src/transfer.js";
import { readEnvSettings, resolveSettings } from "../src/settings.js";

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";

/* --------------------------- pure helpers --------------------------- */

test("encryptStream writes the same layout decryptFile reads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-enc-"));
  try {
    const key = generateKeyB64();
    const plain = Buffer.alloc(3 * 1024 * 1024 + 17, 7);
    const enc = join(dir, "x.enc");
    await pipeline(Readable.from([plain.subarray(0, 1000), plain.subarray(1000)]), encryptStream(key), createWriteStream(enc));
    assert.equal((await stat(enc)).size, plain.length + 12 + 16, "IV + ciphertext + tag");
    await decryptFile(enc, join(dir, "x"), key);
    const h = new HashCounter();
    await pipeline(Readable.from([plain]), h, new PassThrough().resume());
    assert.equal(await sha256File(join(dir, "x")), h.digest());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty stream still encrypts to a valid file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-enc-"));
  try {
    const key = generateKeyB64();
    await pipeline(Readable.from([]), encryptStream(key), createWriteStream(join(dir, "e.enc")));
    await decryptFile(join(dir, "e.enc"), join(dir, "e"), key);
    assert.equal((await stat(join(dir, "e"))).size, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("agent settings: the host env wins over CBM, invalid env values are ignored", () => {
  const env = readEnvSettings({
    AGENT_CONCURRENCY: "4",
    AGENT_STAGING_MODE: "sideways",
    LOG_LEVEL: "debug",
    RESTIC_READ_CONCURRENCY: "6",
    RESTIC_PACK_SIZE: "999",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(env, { concurrency: 4, logLevel: "debug", resticReadConcurrency: 6 });
  const s = resolveSettings(env, { concurrency: 1, minFreeMb: 2048, stagingMode: "direct", logLevel: "error", resticPackSize: 64 });
  assert.deepEqual(s, {
    concurrency: 4,
    minFreeMb: 2048,
    stagingMode: "direct",
    logLevel: "debug",
    resticReadConcurrency: 6,
    resticPackSize: 64,
    freezeMethod: "pause",
  });
  assert.equal(resolveSettings({}, undefined).stagingMode, "auto");
});

/* ------------------- real Docker (CBM_DOCKER_TESTS=1) ------------------- */

/** Fill a fresh volume with random files and return its content fingerprint. */
async function makeVolume(name: string): Promise<string> {
  await docker(["volume", "create", name]);
  const r = await docker([
    "run", "--rm", "-v", `${name}:/data`, "alpine:3.24", "sh", "-c",
    "mkdir -p /data/sub && head -c 8388608 /dev/urandom > /data/big.bin && echo hello > /data/sub/a.txt && ln -s a.txt /data/sub/link",
  ]);
  assert.equal(r.code, 0, r.stderr);
  return fingerprint(name);
}

async function fingerprint(name: string): Promise<string> {
  const r = await docker(["run", "--rm", "-v", `${name}:/data:ro`, "alpine:3.24", "sh", "-c", "cd /data && find . | sort && find . -type f | sort | xargs sha256sum"]);
  assert.equal(r.code, 0, r.stderr);
  return r.stdout;
}

test("captureTar: plain and encrypted copies, local and through a transfer, restore identically", { skip: !DOCKER, timeout: 300_000 }, async () => {
  const id = Math.random().toString(36).slice(2, 8);
  const src = `cbm-capture-src-${id}`;
  const dir = await mkdtemp(join(tmpdir(), "cbm-capture-"));
  const volumes = [src];
  try {
    const want = await makeVolume(src);
    const size = await pathSizeBytes(src);
    assert.ok(size && size >= 8 * 1024 * 1024, `measured ${size}`);

    // Plain, to a local file.
    const plainFile = join(dir, "v.tar");
    const plain = await captureTar(src, (b) => pipeline(b, createWriteStream(plainFile)));
    assert.equal(plain.storedBytes, (await stat(plainFile)).size);
    assert.equal(plain.sha256, await sha256File(plainFile));

    // Encrypted, straight through a destination transfer (the "direct" path).
    const key = generateKeyB64();
    const dest = join(dir, "dest");
    const t = await makeTransfer({ type: "local", basePath: dest });
    const enc = await captureTar(src, (b) => t.putStream(b, "snap/v.tar.enc", size ?? undefined), key);
    await t.close();
    const stored = join(dest, "snap/v.tar.enc");
    assert.equal(enc.storedBytes, (await stat(stored)).size);
    assert.equal(enc.sha256, plain.sha256, "the manifest hash is the plaintext's");
    await decryptFile(stored, join(dir, "v2.tar"), key);

    for (const [file, vol] of [[plainFile, `cbm-capture-a-${id}`], [join(dir, "v2.tar"), `cbm-capture-b-${id}`]] as const) {
      volumes.push(vol);
      await restoreVolume(vol, file);
      assert.equal(await fingerprint(vol), want, `${vol} restores the same content`);
    }
  } finally {
    for (const v of volumes) await docker(["volume", "rm", "-f", v]);
    await rm(dir, { recursive: true, force: true });
  }
});

test("captureTar fails when the destination fails, without leaving tar running", { skip: !DOCKER, timeout: 120_000 }, async () => {
  const src = `cbm-capture-fail-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await makeVolume(src);
    await assert.rejects(
      captureTar(src, async (b) => {
        for await (const _ of b) throw new Error("destination unreachable");
      }),
      /destination unreachable/,
    );
  } finally {
    await docker(["volume", "rm", "-f", src]);
  }
});
