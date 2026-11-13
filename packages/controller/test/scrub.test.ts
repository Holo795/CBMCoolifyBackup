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

test("keeps what a late result needs: the restore's redeploy flags and a prune's snapshots", () => {
  assert.deepEqual(
    scrubPayload({
      id: "j2",
      type: "restore",
      target: "in_place",
      restart: false,
      destination: { secretKey: "SK" },
      decryptionKey: "k1",
    }),
    { scrubbed: true, id: "j2", type: "restore", target: "in_place", restart: false },
  );
  assert.deepEqual(
    scrubPayload({ type: "prune", snapshotIds: ["s1", "s2"], dirs: ["a/b"], destination: { password: "pw" } }),
    { scrubbed: true, type: "prune", snapshotIds: ["s1", "s2"] },
  );
  // A list that isn't only ids is still dropped.
  assert.deepEqual(scrubPayload({ snapshotIds: [{ password: "pw" }] }), { scrubbed: true });
});

test("a stored job keeps its secrets encrypted; CBM reads the clear part, the agent gets it whole", async () => {
  const { jobPayload, fullJobPayload } = await import("../src/lib/jobs");
  const job = {
    id: "j3",
    type: "verify-destination",
    destinationId: "d1",
    isDeep: true,
    usageResources: { tagA: ["r1", "r2"] },
    destination: { type: "s3", accessKeyId: "AK", secretAccessKey: "SK-very-secret" },
    storage: { engine: "restic", resticPassword: "pw-very-secret" },
  };
  const stored = jobPayload(job);
  assert.doesNotMatch(JSON.stringify(stored.payload), /SK-very-secret|pw-very-secret/);
  assert.doesNotMatch(stored.payloadEnc, /SK-very-secret|pw-very-secret/);
  assert.deepEqual(stored.payload, { scrubbed: true, id: "j3", type: "verify-destination", destinationId: "d1", isDeep: true, usageResources: { tagA: ["r1", "r2"] } });
  assert.deepEqual(fullJobPayload({ payload: stored.payload, payloadEnc: stored.payloadEnc }), job);
  // A row from before: its payload was the whole job.
  assert.deepEqual(fullJobPayload({ payload: job, payloadEnc: null }), job);
});
