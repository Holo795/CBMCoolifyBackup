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
