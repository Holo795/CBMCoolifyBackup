import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  encryptSecret,
  decryptSecret,
  decryptSecretWithKey,
  sha256Hex,
  generateAesKeyB64,
  masterKeyB64,
  masterKeyFingerprint,
  encryptFileWithKey,
  decryptFileWithKey,
} from "../src/lib/crypto";

test("encryptSecret/decryptSecret round-trips arbitrary strings", () => {
  for (const s of ["hello", "unicode: café ☕ 日本語", JSON.stringify({ a: 1, b: [2, 3] })]) {
    assert.equal(decryptSecret(encryptSecret(s)), s);
  }
});

test("encryptSecret is non-deterministic (fresh IV each time)", () => {
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

test("decryptSecret rejects a malformed blob", () => {
  assert.throws(() => decryptSecret("not-a-valid-blob"));
});

test("decryptSecret fails on a tampered ciphertext (GCM auth)", () => {
  const blob = encryptSecret("secret");
  const [iv, tag, ct] = blob.split(".");
  const flipped = Buffer.from(ct, "base64");
  flipped[0] ^= 0xff;
  assert.throws(() => decryptSecret(`${iv}.${tag}.${flipped.toString("base64")}`));
});

test("sha256Hex is stable and correct", () => {
  // echo -n "" | sha256sum
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("masterKeyB64 decodes to 32 bytes; fingerprint is stable", () => {
  assert.equal(Buffer.from(masterKeyB64(), "base64").length, 32);
  assert.equal(masterKeyFingerprint(), masterKeyFingerprint());
  assert.match(masterKeyFingerprint(), /^[0-9a-f]{64}$/);
});

test("recovery seal/unseal: encryptFileWithKey → decryptFileWithKey round-trips", async () => {
  const key = randomBytes(32);
  const dir = await mkdtemp(join(tmpdir(), "cbm-crypto-test-"));
  try {
    const src = join(dir, "src.bin");
    const enc = join(dir, "src.enc");
    const out = join(dir, "out.bin");
    // A payload larger than one chunk to exercise the streaming path.
    const payload = randomBytes(200_000);
    await writeFile(src, payload);
    await encryptFileWithKey(src, enc, key);
    await decryptFileWithKey(enc, out, key);
    assert.ok((await readFile(out)).equals(payload));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("recovery unseal with the WRONG key fails (GCM tag)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-crypto-test-"));
  try {
    const src = join(dir, "src.bin");
    const enc = join(dir, "src.enc");
    const out = join(dir, "out.bin");
    await writeFile(src, Buffer.from("payload"));
    await encryptFileWithKey(src, enc, randomBytes(32));
    await assert.rejects(decryptFileWithKey(enc, out, randomBytes(32)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("decryptSecretWithKey reads a secret encrypted under a foreign master key", () => {
  // Simulate the recovery-file import: a blob is decryptable with the key it
  // was encrypted under. We use the current master key as the 'foreign' one.
  const key = Buffer.from(masterKeyB64(), "base64");
  const blob = encryptSecret("api-token");
  assert.equal(decryptSecretWithKey(blob, key), "api-token");
});

test("generateAesKeyB64 yields distinct 32-byte keys", () => {
  const a = generateAesKeyB64();
  const b = generateAesKeyB64();
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, "base64").length, 32);
});
