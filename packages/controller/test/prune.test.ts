import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSnapshotsForPrune } from "../src/lib/jobs";
import type { Destination } from "../src/generated/prisma/client";

/** Minimal Destination stub — grouping only reads `id` and `type`. */
function dest(id: string, type: "local" | "ssh" | "s3"): Destination {
  return { id, type } as unknown as Destination;
}

function snap(over: {
  id: string;
  destinationDir?: string;
  agentId?: string | null;
  resticSnapshotId?: string | null;
  resticPartIds?: string[];
  instanceId?: string | null;
  destination: Destination;
}) {
  return {
    destinationDir: `dir/${over.id}`,
    agentId: null,
    resticSnapshotId: null,
    instanceId: null,
    ...over,
  };
}

test("local snapshots group per producing agent (files live on each host)", () => {
  const d = dest("d1", "local");
  const groups = groupSnapshotsForPrune([
    snap({ id: "s1", agentId: "a1", destination: d }),
    snap({ id: "s2", agentId: "a1", destination: d }),
    snap({ id: "s3", agentId: "a2", destination: d }),
  ]);
  assert.equal(groups.length, 2);
  const byAgent = Object.fromEntries(groups.map((g) => [g.agentId, g.snapshotIds.sort()]));
  assert.deepEqual(byAgent["a1"], ["s1", "s2"]);
  assert.deepEqual(byAgent["a2"], ["s3"]);
});

test("remote (ssh/s3) snapshots group per instance, ignoring the agent", () => {
  const d = dest("d2", "s3");
  const groups = groupSnapshotsForPrune([
    snap({ id: "s1", agentId: "a1", instanceId: "i1", destination: d }),
    snap({ id: "s2", agentId: "a2", instanceId: "i1", destination: d }),
    snap({ id: "s3", agentId: "a3", instanceId: "i2", destination: d }),
  ]);
  assert.equal(groups.length, 2);
  const byInstance = Object.fromEntries(groups.map((g) => [g.instanceId, g.snapshotIds.sort()]));
  assert.deepEqual(byInstance["i1"], ["s1", "s2"]);
  assert.deepEqual(byInstance["i2"], ["s3"]);
  assert.ok(groups.every((g) => g.agentId === null), "remote groups don't pin an agent");
});

test("restic snapshot ids are collected per group", () => {
  const d = dest("d3", "s3");
  const groups = groupSnapshotsForPrune([
    snap({ id: "s1", instanceId: "i1", resticSnapshotId: "r1", destination: d }),
    snap({ id: "s2", instanceId: "i1", resticSnapshotId: "r2", destination: d }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].resticSnapshotIds.sort(), ["r1", "r2"]);
});

test("different destinations never share a group", () => {
  const groups = groupSnapshotsForPrune([
    snap({ id: "s1", instanceId: "i1", destination: dest("d1", "s3") }),
    snap({ id: "s2", instanceId: "i1", destination: dest("d2", "s3") }),
  ]);
  assert.equal(groups.length, 2);
});

test("a restic snapshot's parts (volumes read in place) are forgotten with it", () => {
  const d = dest("d4", "s3");
  const groups = groupSnapshotsForPrune([
    snap({ id: "s1", instanceId: "i1", resticSnapshotId: "r1", resticPartIds: ["p1", "p2"], destination: d }),
    snap({ id: "s2", instanceId: "i1", resticSnapshotId: "r2", destination: d }),
    // No main snapshot (a failed run): nothing to forget, parts or not.
    snap({ id: "s3", instanceId: "i1", resticSnapshotId: null, resticPartIds: ["p3"], destination: d }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].resticSnapshotIds.sort(), ["p1", "p2", "r1", "r2"]);
});
