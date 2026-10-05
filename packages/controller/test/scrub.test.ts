import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubPayload } from "../src/lib/scrub";

test("keeps non-secret scalars, drops nested objects and secret keys", () => {
  const out = scrubPayload({
    id: "j1",
    type: "mirror",
    sourceSnapshotId: "s1",
    targetDestinationId: "d2",
    isDeep: true,
    destination: { type: "s3", accessKey: "AK", secretKey: "SK" },
    encryption: { enabled: true, key: "base64key" },
    storage: { engine: "restic", resticPassword: "pw" },
    resource: { db: { user: "app", password: "pw" } },
    decryptionKey: "k1",
    sourceEncryptionKey: "k2",
    targetEncryptionKey: "k3",
    envEnc: "iv.tag.ct",
  });
  assert.deepEqual(out, {
    scrubbed: true,
    id: "j1",
    type: "mirror",
    sourceSnapshotId: "s1",
    targetDestinationId: "d2",
    isDeep: true,
  });
  assert.doesNotMatch(JSON.stringify(out), /SK|pw|base64key|k1|k2|k3/);
});

test("handles empty and non-object payloads", () => {
  assert.deepEqual(scrubPayload(null), { scrubbed: true });
  assert.deepEqual(scrubPayload({}), { scrubbed: true });
  assert.deepEqual(scrubPayload([1, 2]), { scrubbed: true });
});
