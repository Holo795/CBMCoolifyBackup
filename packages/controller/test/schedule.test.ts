import { test } from "node:test";
import assert from "node:assert/strict";
import { freqToCron, cronToFrequency } from "../src/lib/schedule";

test("freqToCron maps every preset to a cron and back", () => {
  for (const freq of ["hourly", "daily", "weekly", "monthly"]) {
    const cron = freqToCron(freq);
    assert.match(cron, /^\S+ \S+ \S+ \S+ \S+$/, `${freq} → a 5-field cron`);
    assert.equal(cronToFrequency(cron), freq, `${freq} round-trips`);
  }
});

test("freqToCron custom uses the provided expression", () => {
  assert.equal(freqToCron("custom", "*/5 * * * *"), "*/5 * * * *");
});

test("freqToCron custom falls back to a default when blank", () => {
  assert.match(freqToCron("custom", ""), /^\S+ \S+ \S+ \S+ \S+$/);
});

test("freqToCron unknown frequency falls back to daily", () => {
  assert.equal(freqToCron("nonsense"), freqToCron("daily"));
});

test("cronToFrequency returns 'custom' for an unrecognised cron", () => {
  assert.equal(cronToFrequency("7 3 * * 2"), "custom");
});
