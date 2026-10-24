import { test } from "node:test";
import assert from "node:assert/strict";
import { nextJob } from "../src/lib/job-order";

const job = (id: string, type: string, destinationId: string | null = null) => ({ id, type, destinationId });

test("next job: restores, then backups, then drills, prunes last - oldest first within each", () => {
  const queued = [job("p1", "prune", "d1"), job("d1", "restore-drill"), job("b1", "backup"), job("b2", "backup"), job("r1", "restore")];
  assert.equal(nextJob(queued, new Set())?.id, "r1");
  assert.equal(nextJob(queued.filter((j) => j.id !== "r1"), new Set())?.id, "b1");
  assert.equal(nextJob([job("p1", "prune", "d1"), job("d1", "restore-drill")], new Set())?.id, "d1");
  assert.equal(nextJob([job("p1", "prune", "d1"), job("p2", "prune", "d2")], new Set())?.id, "p1");
  assert.equal(nextJob([], new Set()), null);
});

test("next job: no second prune on a destination already being pruned", () => {
  const queued = [job("p1", "prune", "d1"), job("p2", "prune", "d2")];
  assert.equal(nextJob(queued, new Set(["d1"]))?.id, "p2");
  assert.equal(nextJob(queued, new Set(["d1", "d2"])), null);
  // Without a destination (older payloads): not held back.
  assert.equal(nextJob([job("p0", "prune")], new Set(["d1"]))?.id, "p0");
});
