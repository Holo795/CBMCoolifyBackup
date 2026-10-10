import { test } from "node:test";
import assert from "node:assert/strict";
import { integrityReadSubset, INTEGRITY_SLICES } from "../src/lib/jobs";

test("the integrity check reads every slice of the data once in 20 weeks", () => {
  const start = new Date("2026-10-10T04:00:00Z").getTime();
  const seen = new Set<string>();
  for (let w = 0; w < INTEGRITY_SLICES; w++) seen.add(integrityReadSubset(new Date(start + w * 7 * 86_400_000)));
  assert.equal(seen.size, INTEGRITY_SLICES);
  for (const s of seen) assert.match(s, /^\d+\/20$/);
  // Same week, same slice.
  assert.equal(integrityReadSubset(new Date(start)), integrityReadSubset(new Date(start + 3600_000)));
});
