import { test } from "node:test";
import assert from "node:assert/strict";
import { stuckReason, queueExpiredReason } from "../src/lib/reaper";

const NOW = new Date("2026-01-01T12:00:00Z");
const OFFLINE_MS = 2 * 60_000; // agent offline after 2 min silent
const FALLBACK_CAP = 2 * 3600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const onlineAgent = { status: "online", lastSeenAt: ago(10_000) };

test("a job whose agent is offline is stuck", () => {
  assert.equal(
    stuckReason({ type: "backup", claimedAt: ago(60_000), agent: { status: "offline", lastSeenAt: ago(60_000) } }, NOW, OFFLINE_MS, FALLBACK_CAP),
    "agent went offline mid-job",
  );
});

test("a job whose agent is missing is stuck", () => {
  assert.equal(stuckReason({ type: "backup", claimedAt: ago(60_000), agent: null }, NOW, OFFLINE_MS, FALLBACK_CAP), "agent went offline mid-job");
});

test("an online agent that stopped heartbeating counts as offline", () => {
  assert.equal(
    stuckReason({ type: "backup", claimedAt: ago(60_000), agent: { status: "online", lastSeenAt: ago(5 * 60_000) } }, NOW, OFFLINE_MS, FALLBACK_CAP),
    "agent went offline mid-job",
  );
});

test("a long backup on a live agent is NOT killed (under the 6h cap)", () => {
  assert.equal(stuckReason({ type: "backup", claimedAt: ago(5 * 3600_000), agent: onlineAgent }, NOW, OFFLINE_MS, FALLBACK_CAP), null);
});

test("a backup past the 6h cap is stuck", () => {
  assert.equal(
    stuckReason({ type: "backup", claimedAt: ago(7 * 3600_000), agent: onlineAgent }, NOW, OFFLINE_MS, FALLBACK_CAP),
    "job exceeded its time limit",
  );
});

test("verify-destination has a shorter (2h) cap", () => {
  assert.equal(stuckReason({ type: "verify-destination", claimedAt: ago(90 * 60_000), agent: onlineAgent }, NOW, OFFLINE_MS, FALLBACK_CAP), null);
  assert.equal(
    stuckReason({ type: "verify-destination", claimedAt: ago(3 * 3600_000), agent: onlineAgent }, NOW, OFFLINE_MS, FALLBACK_CAP),
    "job exceeded its time limit",
  );
});

test("an unknown job type uses the fallback cap", () => {
  assert.equal(stuckReason({ type: "weird", claimedAt: ago(90 * 60_000), agent: onlineAgent }, NOW, OFFLINE_MS, FALLBACK_CAP), null);
  assert.equal(
    stuckReason({ type: "weird", claimedAt: ago(3 * 3600_000), agent: onlineAgent }, NOW, OFFLINE_MS, FALLBACK_CAP),
    "job exceeded its time limit",
  );
});

test("a fresh job on a live agent is healthy", () => {
  assert.equal(stuckReason({ type: "restore", claimedAt: ago(60 * 60_000), agent: onlineAgent }, NOW, OFFLINE_MS, FALLBACK_CAP), null);
});

test("a queued in-place restore expires after 30 min (it must not run days later)", () => {
  assert.equal(queueExpiredReason({ type: "restore", createdAt: ago(29 * 60_000) }, NOW), null);
  assert.match(queueExpiredReason({ type: "restore", createdAt: ago(31 * 60_000) }, NOW) ?? "", /within 30 min/);
});

test("queue limits are per type: backups 2h, prunes may wait days", () => {
  assert.equal(queueExpiredReason({ type: "backup", createdAt: ago(90 * 60_000) }, NOW), null);
  assert.ok(queueExpiredReason({ type: "backup", createdAt: ago(3 * 3600_000) }, NOW));
  assert.equal(queueExpiredReason({ type: "prune", createdAt: ago(3 * 24 * 3600_000) }, NOW), null);
  assert.ok(queueExpiredReason({ type: "prune", createdAt: ago(8 * 24 * 3600_000) }, NOW));
  assert.ok(queueExpiredReason({ type: "unknown", createdAt: ago(13 * 3600_000) }, NOW));
});
