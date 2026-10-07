import { test } from "node:test";
import assert from "node:assert/strict";
import { shownStatus } from "../src/lib/snapshot-status";
import { statusTone } from "../src/components/ui/badge";

test("a succeeded backup with warnings is shown as such, in orange", () => {
  assert.equal(shownStatus({ status: "succeeded", warnings: ["dump failed"] }), "warning");
  assert.equal(shownStatus({ status: "succeeded", warnings: [] }), "succeeded");
  assert.equal(shownStatus({ status: "failed", warnings: ["x"] }), "failed");
  assert.equal(statusTone("warning"), "warning");
  assert.equal(statusTone("succeeded"), "success");
});
