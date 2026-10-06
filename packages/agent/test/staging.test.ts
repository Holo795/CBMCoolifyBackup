import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseStaging } from "../src/staging.js";

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

test("restic always copies locally, and refuses when it can't", () => {
  assert.deepEqual(chooseStaging({ ...base, mode: "direct", engine: "restic", needBytes: 1 * GiB, freeBytes: 10 * GiB }), { where: "local" });
  const r = chooseStaging({ ...base, mode: "auto", engine: "restic", needBytes: 20 * GiB, freeBytes: 10 * GiB });
  assert.ok("error" in r && /restic engine needs a local copy/.test(r.error));
});

test("an unknown size or free space keeps the previous behaviour (local)", () => {
  assert.deepEqual(chooseStaging({ ...base, mode: "auto", engine: "tar", needBytes: null, freeBytes: 1 }), { where: "local" });
  assert.deepEqual(chooseStaging({ ...base, mode: "local", engine: "restic", needBytes: 50 * GiB, freeBytes: null }), { where: "local" });
});
