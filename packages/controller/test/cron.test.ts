import { test } from "node:test";
import assert from "node:assert/strict";
import { cronMatches, isValidCron } from "../src/lib/cron";

function at(iso: string) {
  return new Date(iso);
}

test("matches a daily 02:00 schedule", () => {
  assert.equal(cronMatches("0 2 * * *", at("2026-06-23T02:00:00Z")), true);
  assert.equal(cronMatches("0 2 * * *", at("2026-06-23T02:01:00Z")), false);
  assert.equal(cronMatches("0 2 * * *", at("2026-06-23T03:00:00Z")), false);
});

test("supports steps and lists", () => {
  assert.equal(cronMatches("*/15 * * * *", at("2026-06-23T10:30:00Z")), true);
  assert.equal(cronMatches("*/15 * * * *", at("2026-06-23T10:31:00Z")), false);
  assert.equal(cronMatches("0 0,12 * * *", at("2026-06-23T12:00:00Z")), true);
});

test("day-of-week matching (Sunday=0)", () => {
  // 2026-06-21 is a Sunday
  assert.equal(cronMatches("0 9 * * 0", at("2026-06-21T09:00:00Z")), true);
  assert.equal(cronMatches("0 9 * * 1", at("2026-06-21T09:00:00Z")), false);
});

test("evaluates the schedule in the configured timezone", () => {
  // Summer in Paris is CEST (UTC+2): 02:00 Paris == 00:00 UTC.
  assert.equal(cronMatches("0 2 * * *", at("2026-07-01T00:00:00Z"), "Europe/Paris"), true);
  assert.equal(cronMatches("0 2 * * *", at("2026-07-01T02:00:00Z"), "Europe/Paris"), false);
  // Same instant in UTC matches 00:00, not 02:00.
  assert.equal(cronMatches("0 0 * * *", at("2026-07-01T00:00:00Z"), "UTC"), true);
});

test("validates cron expressions", () => {
  assert.equal(isValidCron("0 2 * * *"), true);
  assert.equal(isValidCron("nonsense"), false);
  assert.equal(isValidCron("0 2 * *"), false);
});

test("a zero, negative or malformed step is rejected instead of looping forever", () => {
  for (const bad of ["*/0 * * * *", "*/-1 * * * *", "*/x * * * *", "0-60 * * * *", "0 24 * * *", "0 0 0 * *", "0 0 * 13 *", "5-1 * * * *", "1,,2 * * * *"]) {
    assert.equal(isValidCron(bad), false, bad);
  }
});

test("valid crons still parse, and 7 means Sunday in the weekday field", () => {
  for (const ok of ["* * * * *", "*/15 2-4 * * 1-5", "0 2 * * *", "0 2 1 * *", "0 2 * * 0", "0 2 * * 7", "30 3 * * *"]) {
    assert.equal(isValidCron(ok), true, ok);
  }
  // 2026-01-04 is a Sunday.
  assert.equal(cronMatches("0 2 * * 7", new Date("2026-01-04T02:00:00Z"), "UTC"), true);
  assert.equal(cronMatches("0 2 * * 7", new Date("2026-01-05T02:00:00Z"), "UTC"), false);
});

test("clock changes: a skipped 02:00 runs at 03:00, a repeated one runs once", async () => {
  const { cronDue, previousFireWithin } = await import("../src/lib/cron");
  const fires = (expr: string, fromIso: string, hours: number, tz: string) => {
    const out: string[] = [];
    const start = Date.parse(fromIso);
    for (let i = 0; i < hours * 60; i++) {
      const at = new Date(start + i * 60_000);
      if (cronDue(expr, at, tz)) out.push(at.toISOString());
    }
    return out;
  };
  // Europe/Paris, 2026-03-29: 02:00 local doesn't exist (01:59 +01:00 -> 03:00 +02:00).
  assert.deepEqual(fires("0 2 * * *", "2026-03-28T00:00:00Z", 72, "Europe/Paris"), [
    "2026-03-28T01:00:00.000Z",
    "2026-03-29T01:00:00.000Z", // 03:00 local, right after the gap
    "2026-03-30T00:00:00.000Z",
  ]);
  // 2026-10-25: 02:00-02:59 local happen twice: once only.
  assert.deepEqual(fires("30 2 * * *", "2026-10-24T00:00:00Z", 72, "Europe/Paris"), [
    "2026-10-24T00:30:00.000Z",
    "2026-10-25T00:30:00.000Z",
    "2026-10-26T01:30:00.000Z",
  ]);
  // An hourly schedule: 24 runs on the short day, 25 on the long one... minus the repeat.
  assert.equal(fires("0 * * * *", "2026-03-28T23:00:00Z", 23, "Europe/Paris").length, 23);
  // The overdue check sees the run that replaced the skipped one.
  assert.equal(previousFireWithin("0 2 * * *", new Date("2026-03-29T05:00:00Z"), "Europe/Paris")?.toISOString(), "2026-03-29T01:00:00.000Z");
  // Without a clock change, as before.
  assert.deepEqual(fires("0 2 * * *", "2026-06-01T00:00:00Z", 24, "UTC"), ["2026-06-01T02:00:00.000Z"]);
});
