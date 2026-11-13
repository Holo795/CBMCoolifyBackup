import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKeepSet } from "../src/lib/gfs";

const at = (iso: string) => new Date(iso);
/** One snapshot every `stepH` hours, `count` of them, newest first. */
function series(count: number, stepH: number, newest = "2026-11-10T18:00:00Z") {
  const end = Date.parse(newest);
  return Array.from({ length: count }, (_, i) => ({ id: new Date(end - i * stepH * 3600_000).toISOString().slice(0, 13), at: new Date(end - i * stepH * 3600_000) }));
}

test("each rule keeps the newest of its periods independently (7 days, 4 weeks, 6 months)", () => {
  const snaps = series(200, 24); // daily, 200 days
  const keep = [...computeKeepSet(snaps, { daily: 7, weekly: 4, monthly: 6 })].sort().reverse();
  // The 7 last days, the newest of the last 4 weeks (3 already among the days),
  // the newest of the last 6 months.
  assert.deepEqual(keep.slice(0, 7), ["2026-11-10T18", "2026-11-09T18", "2026-11-08T18", "2026-11-07T18", "2026-11-06T18", "2026-11-05T18", "2026-11-04T18"]);
  // Weeks: this one (already a day), then the Sundays ending the 3 before.
  assert.ok(keep.includes("2026-11-01T18") && keep.includes("2026-10-25T18"), "weeks go back 4 weeks, not 2");
  assert.equal(keep.includes("2026-10-18T18"), false);
  // Months: this one, then the last day of the 5 before.
  assert.ok(["2026-10-31T18", "2026-09-30T18", "2026-08-31T18", "2026-07-31T18", "2026-06-30T18"].every((d) => keep.includes(d)), "month ends");
  assert.equal(keep.includes("2026-05-31T18"), false, "a 7th month is gone");
  assert.equal(keep.length, 14);
});

test("an hourly schedule keeps its hours", () => {
  const keep = computeKeepSet(series(72, 1), { hourly: 24, daily: 7, weekly: 0, monthly: 0 });
  // 24 last hours + newest of each of the 3 days covered.
  assert.equal(keep.size, 24 + 2);
});

test("the last N, and years", () => {
  const snaps = series(10, 24);
  assert.equal(computeKeepSet(snaps, { last: 3, daily: 0, weekly: 0, monthly: 0 }).size, 3);
  const years = [at("2026-01-05T02:00:00Z"), at("2025-06-01T02:00:00Z"), at("2025-01-01T02:00:00Z"), at("2024-03-01T02:00:00Z")].map((d) => ({ id: d.toISOString(), at: d }));
  assert.deepEqual([...computeKeepSet(years, { daily: 0, weekly: 0, monthly: 0, yearly: 2 })].sort(), ["2025-06-01T02:00:00.000Z", "2026-01-05T02:00:00.000Z"]);
});

test("days are those of the configured timezone", () => {
  // 23:30 in Paris on the 9th is the 9th there, the 9th in UTC too; 00:30 on
  // the 10th in Paris is the 9th in UTC.
  const snaps = [
    { id: "late", at: at("2026-11-09T23:30:00Z") }, // 00:30 the 10th in Paris
    { id: "evening", at: at("2026-11-09T22:30:00Z") }, // 23:30 the 9th in Paris
  ];
  assert.deepEqual([...computeKeepSet(snaps, { daily: 2, weekly: 0, monthly: 0 }, "Europe/Paris")].sort(), ["evening", "late"]);
  assert.deepEqual([...computeKeepSet(snaps, { daily: 2, weekly: 0, monthly: 0 }, "UTC")], ["late"]);
});

test("an empty retention still keeps the newest snapshot", () => {
  const keep = computeKeepSet([{ id: "old", at: at("2026-06-22T02:00:00Z") }, { id: "new", at: at("2026-06-23T02:00:00Z") }], { daily: 0, weekly: 0, monthly: 0 });
  assert.deepEqual([...keep], ["new"]);
  assert.equal(computeKeepSet([], { daily: 0, weekly: 0, monthly: 0 }).size, 0);
});
