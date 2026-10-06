import { test } from "node:test";
import assert from "node:assert/strict";
import { freqToCron, cronToFrequency, describeCron, modeLabel, captureLabel } from "../src/lib/schedule";
import { makeT } from "../src/lib/i18n-shared";

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

test("describeCron describes presets in the UI language and keeps custom crons", () => {
  const en = makeT("en");
  const fr = makeT("fr");
  assert.equal(describeCron(freqToCron("daily"), en, "Europe/Paris"), "daily at 02:00 Europe/Paris");
  assert.equal(describeCron(freqToCron("daily"), fr, "Europe/Paris"), "tous les jours à 02:00 Europe/Paris");
  assert.equal(describeCron(freqToCron("hourly"), fr), "toutes les heures");
  assert.equal(describeCron(freqToCron("weekly"), en), "weekly (Mon 02:00)");
  assert.equal(describeCron(freqToCron("monthly"), en), "monthly (day 1, 02:00)");
});

test("describeCron spells out any fixed-time schedule and keeps the rest as-is", () => {
  const en = makeT("en");
  const fr = makeT("fr");
  assert.equal(describeCron("0 3 * * *", en, "Europe/Paris"), "daily at 03:00 Europe/Paris");
  assert.equal(describeCron("30 23 * * *", fr), "tous les jours à 23:30");
  assert.equal(describeCron("15 * * * *", en), "hourly at :15");
  assert.equal(describeCron("7 3 * * 2", fr, "UTC"), "chaque semaine (mar. 03:07 UTC)");
  assert.equal(describeCron("0 4 * * 0", en), "weekly (Sun 04:00)");
  assert.equal(describeCron("0 4 * * 7", en), "weekly (Sun 04:00)");
  assert.equal(describeCron("0 5 15 * *", fr), "chaque mois (jour 15, 05:00)");
  for (const raw of ["*/5 * * * *", "0 2 * * 1-5", "0 2,14 * * *", "0 2 1 1 *", "0 2 1 * 1", "61 2 * * *", "0 2 * *"]) {
    assert.equal(describeCron(raw, en), raw, raw);
  }
});

test("modeLabel and captureLabel translate known tokens and pass others through", () => {
  const fr = makeT("fr");
  assert.equal(modeLabel("backup", fr), "sauvegarde");
  assert.equal(modeLabel("sync", makeT("en")), "sync");
  assert.equal(modeLabel("weird", fr), "weird");
  assert.equal(captureLabel("dump+frozen", fr), "dump+gelée");
  assert.equal(captureLabel("cold", fr), "cold");
});
