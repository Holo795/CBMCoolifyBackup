import { test } from "node:test";
import assert from "node:assert/strict";
import { integrityReadSubset, INTEGRITY_READ_WEEKS } from "../src/lib/jobs";

test("a restic check reads a new slice each day: all of it in N weeks", () => {
  const start = Date.parse("2026-11-01T04:00:00Z");
  for (const weeks of [INTEGRITY_READ_WEEKS, 1, 12]) {
    const seen = new Set<string>();
    for (let d = 0; d < 7 * weeks; d++) seen.add(integrityReadSubset(new Date(start + d * 86_400_000), weeks));
    assert.equal(seen.size, 7 * weeks);
    assert.ok([...seen].every((s) => s.endsWith(`/${7 * weeks}`)));
  }
  // Same slice all day; out-of-range weeks are clamped.
  assert.equal(integrityReadSubset(new Date(start), 4), integrityReadSubset(new Date(start + 3600_000), 4));
  assert.match(integrityReadSubset(new Date(start), 99), /\/140$/);
});
