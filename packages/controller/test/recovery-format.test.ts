import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeRecoveryFile,
  encodeRecoveryFile,
  isRecoveryV2,
  passphraseProblem,
  readRecoveryHeader,
  RecoveryPassphraseError,
} from "../src/lib/recovery-format";

const meta = { kind: "full" as const, generation: 3, createdAt: "2026-11-13T10:00:00.000Z", cbmVersion: "2.8.0", migrationId: "0046_env_blobs" };
const secrets = { masterKey: Buffer.alloc(32, 9).toString("base64"), selfBackup: { destination: { type: "s3", secretAccessKey: "SK-secret" }, path: "p" } };
const fast = { N: 2 ** 14, r: 8, p: 1 };

test("a recovery file opens with its passphrase only, and shows nothing secret without it", async () => {
  const dump = Buffer.from("PGDMP fake dump ".repeat(1000));
  const file = await encodeRecoveryFile(meta, secrets, dump, "correct horse battery", fast);
  assert.equal(isRecoveryV2(file), true);
  assert.doesNotMatch(file.toString("latin1"), /SK-secret|PGDMP/);
  assert.ok(!file.includes(Buffer.from(secrets.masterKey)));
  // The header is readable without the passphrase, and says what it is.
  const header = readRecoveryHeader(file);
  assert.equal(header.kind, "full");
  assert.equal(header.generation, 3);
  // Compressed: the repeated dump shrinks.
  assert.ok(file.length < dump.length / 4);

  const opened = await decodeRecoveryFile(file, "correct horse battery");
  assert.deepEqual(opened.secrets, secrets);
  assert.deepEqual(opened.dump, dump);
  await assert.rejects(decodeRecoveryFile(file, "wrong horse battery"), RecoveryPassphraseError);
});

test("a light file carries no dump; a header changed by hand is refused", async () => {
  const file = await encodeRecoveryFile({ ...meta, kind: "light" }, secrets, null, "correct horse battery", fast);
  assert.equal((await decodeRecoveryFile(file, "correct horse battery")).dump, null);
  const tampered = Buffer.from(file);
  const i = tampered.indexOf(Buffer.from('"light"'));
  tampered.write('"full" ', i, "latin1");
  await assert.rejects(decodeRecoveryFile(tampered, "correct horse battery"), RecoveryPassphraseError);
});

test("a passphrase needs 12 characters at least", () => {
  assert.equal(passphraseProblem("short"), "tooShort");
  assert.equal(passphraseProblem("twelve chars"), null);
});
