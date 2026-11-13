import { test } from "node:test";
import assert from "node:assert/strict";
import { MIRROR_ATTEMPTS, mirrorsToQueue } from "../src/lib/mirror-catchup";

const snap = (id: string, resourceId: string, copied = false) => ({ id, resourceId, copied });

test("the newest backup of each resource gets its missing copy, older ones don't", () => {
  const out = mirrorsToQueue([snap("a2", "a"), snap("a1", "a"), snap("b1", "b"), snap("c2", "c", true), snap("c1", "c")], []);
  assert.deepEqual(out, ["a2", "b1"]);
});

test("a copy already queued or running isn't doubled", () => {
  const out = mirrorsToQueue(
    [snap("a2", "a"), snap("b1", "b")],
    [
      { sourceSnapshotId: "a2", status: "running" },
      { sourceSnapshotId: "b1", status: "queued" },
    ],
  );
  assert.deepEqual(out, []);
});

test("a copy that keeps failing is retried a few times, then left (alerted)", () => {
  const failures = (n: number) => Array.from({ length: n }, () => ({ sourceSnapshotId: "a2", status: "failed" }));
  assert.deepEqual(mirrorsToQueue([snap("a2", "a")], failures(MIRROR_ATTEMPTS - 1)), ["a2"]);
  assert.deepEqual(mirrorsToQueue([snap("a2", "a")], failures(MIRROR_ATTEMPTS)), []);
});
