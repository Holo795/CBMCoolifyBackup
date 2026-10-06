import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseStaging, needsMeasure } from "../src/staging.js";

const GiB = 1024 ** 3;
const base = { label: "volume data", minFreeBytes: 1 * GiB };

test("auto copies locally when it fits, sends directly when it doesn't", () => {
  assert.deepEqual(chooseStaging({ ...base, mode: "auto", engine: "tar", needBytes: 5 * GiB, freeBytes: 10 * GiB }), { where: "local" });
  assert.deepEqual(chooseStaging({ ...base, mode: "auto", engine: "tar", needBytes: 9.5 * GiB, freeBytes: 10 * GiB }), {
    where: "direct",
    because: "no-room",
  });
});

test("local refuses cleanly when it doesn't fit, direct never needs room", () => {
  const r = chooseStaging({ ...base, mode: "local", engine: "tar", needBytes: 20 * GiB, freeBytes: 10 * GiB });
  assert.ok("error" in r && /Not enough free space/.test(r.error) && /auto or direct/.test(r.error));
  assert.deepEqual(chooseStaging({ ...base, mode: "direct", engine: "tar", needBytes: 1, freeBytes: 100 * GiB }), {
    where: "direct",
    because: "setting",
  });
});

test("restic reads the volume in place unless a local copy is asked for", () => {
  for (const mode of ["auto", "direct"] as const) {
    assert.deepEqual(chooseStaging({ ...base, mode, engine: "restic", needBytes: null, freeBytes: null }), { where: "repository" });
  }
  assert.deepEqual(chooseStaging({ ...base, mode: "local", engine: "restic", needBytes: 1 * GiB, freeBytes: 10 * GiB }), { where: "local" });
  const r = chooseStaging({ ...base, mode: "local", engine: "restic", needBytes: 20 * GiB, freeBytes: 10 * GiB });
  assert.ok("error" in r && /auto or direct/.test(r.error));
});

test("the size is measured only when the choice depends on it", () => {
  assert.equal(needsMeasure("auto", "tar"), true);
  assert.equal(needsMeasure("local", "tar"), true);
  assert.equal(needsMeasure("direct", "tar"), false);
  assert.equal(needsMeasure("auto", "restic"), false);
  assert.equal(needsMeasure("direct", "restic"), false);
  assert.equal(needsMeasure("local", "restic"), true);
});

test("an unknown size or free space keeps the previous behaviour (local)", () => {
  assert.deepEqual(chooseStaging({ ...base, mode: "auto", engine: "tar", needBytes: null, freeBytes: 1 }), { where: "local" });
  assert.deepEqual(chooseStaging({ ...base, mode: "local", engine: "restic", needBytes: 50 * GiB, freeBytes: null }), { where: "local" });
});
