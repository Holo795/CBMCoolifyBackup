import { test } from "node:test";
import assert from "node:assert/strict";
import { dueBeforeExpected } from "../src/lib/overdue";

const d = (s: string) => new Date(s);
const policy = { createdAt: d("2026-09-01T00:00:00Z"), updatedAt: d("2026-09-01T00:00:00Z") };
const resource = { createdAt: d("2026-10-06T16:37:00Z"), scheduledSince: null };

test("a scheduled time before the resource was included isn't a missed backup", () => {
  // Included at 15:00 UTC: that morning's 02:00 UTC run wasn't expected...
  const included = { ...resource, scheduledSince: d("2026-10-09T15:00:00Z") };
  assert.equal(dueBeforeExpected(d("2026-10-09T02:00:00Z"), included, policy), true);
  // ...the next morning's is.
  assert.equal(dueBeforeExpected(d("2026-10-10T02:00:00Z"), included, policy), false);
});

test("nor one before the resource existed or before its schedule was set or changed", () => {
  assert.equal(dueBeforeExpected(d("2026-10-06T02:00:00Z"), resource, policy), true);
  const changed = { createdAt: policy.createdAt, updatedAt: d("2026-10-09T10:00:00Z") };
  assert.equal(dueBeforeExpected(d("2026-10-09T02:00:00Z"), resource, changed), true);
  // Included long ago, schedule unchanged: a missed run counts.
  assert.equal(dueBeforeExpected(d("2026-10-09T02:00:00Z"), resource, policy), false);
});

test("fresh: a success since the run before the last one; stale after two runs without", async () => {
  const { isFresh } = await import("../src/lib/overdue");
  const r = { createdAt: new Date("2026-10-01T00:00:00Z"), scheduledSince: null };
  const policy = { createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z") };
  const runBefore = new Date("2026-11-12T02:00:00Z"); // the night before last
  assert.equal(isFresh(new Date("2026-11-12T02:03:00Z"), runBefore, r, policy), true);
  // Last success three nights ago: the last two runs failed or were skipped.
  assert.equal(isFresh(new Date("2026-11-11T02:03:00Z"), runBefore, r, policy), false);
  assert.equal(isFresh(null, runBefore, r, policy), false);
  // A run from before the resource was scheduled never counts.
  assert.equal(isFresh(null, runBefore, { ...r, scheduledSince: new Date("2026-11-12T12:00:00Z") }, policy), true);
});
