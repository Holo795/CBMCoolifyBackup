import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, lastDays, dailyVolume } from "../src/lib/storage-stats";

test("dayKey uses the calendar day in the given timezone", () => {
  const d = new Date("2026-03-10T23:30:00Z");
  assert.equal(dayKey(d, "UTC"), "2026-03-10");
  assert.equal(dayKey(d, "Europe/Paris"), "2026-03-11"); // already the next day in Paris
  assert.equal(dayKey(d, "America/New_York"), "2026-03-10");
});

test("lastDays returns N consecutive days, oldest first, ending today", () => {
  const days = lastDays(3, "UTC", new Date("2026-03-01T10:00:00Z"));
  assert.deepEqual(days, ["2026-02-27", "2026-02-28", "2026-03-01"]);
});

test("lastDays never skips or repeats a day across a DST change", () => {
  // Europe/Paris switches to summer time on 2026-03-29.
  const days = lastDays(5, "Europe/Paris", new Date("2026-03-31T12:00:00Z"));
  assert.deepEqual(days, ["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
  assert.equal(new Set(days).size, days.length);
});

test("dailyVolume buckets sizes per local day and zero-fills gaps", () => {
  const now = new Date("2026-03-03T12:00:00Z");
  const out = dailyVolume(
    [
      { finishedAt: new Date("2026-03-01T08:00:00Z"), sizeBytes: 100n },
      { finishedAt: new Date("2026-03-01T20:00:00Z"), sizeBytes: 50n },
      { finishedAt: new Date("2026-03-03T01:00:00Z"), sizeBytes: 7 },
      { finishedAt: null, sizeBytes: 999n }, // never finished → ignored
      { finishedAt: new Date("2026-01-01T00:00:00Z"), sizeBytes: 999n }, // out of range → ignored
    ],
    3,
    "UTC",
    now,
  );
  assert.deepEqual(out, [
    { day: "2026-03-01", bytes: 150, count: 2 },
    { day: "2026-03-02", bytes: 0, count: 0 },
    { day: "2026-03-03", bytes: 7, count: 1 },
  ]);
});

test("dailyVolume attributes a late-evening UTC backup to the next day in Paris", () => {
  const out = dailyVolume(
    [{ finishedAt: new Date("2026-03-01T23:30:00Z"), sizeBytes: 10n }],
    2,
    "Europe/Paris",
    new Date("2026-03-02T12:00:00Z"),
  );
  assert.deepEqual(out, [
    { day: "2026-03-01", bytes: 0, count: 0 },
    { day: "2026-03-02", bytes: 10, count: 1 },
  ]);
});
