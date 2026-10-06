import { test } from "node:test";
import assert from "node:assert/strict";
import { backupOutcome, unbackedLayerWarning, LAYER_WARN_BYTES } from "../src/outcome.js";

test("something captured is a normal backup", () => {
  assert.equal(backupOutcome(2, true), "data");
  assert.equal(backupOutcome(1, false), "data");
});

test("a running resource with nothing to copy keeps its configuration", () => {
  assert.equal(backupOutcome(0, true), "config");
});

test("a resource with no container on the host is skipped", () => {
  assert.equal(backupOutcome(0, false), "skip");
});

test("only a large writable layer is worth a warning", () => {
  assert.equal(unbackedLayerWarning("app", null), null);
  assert.equal(unbackedLayerWarning("app", 0), null);
  assert.equal(unbackedLayerWarning("app", LAYER_WARN_BYTES - 1), null);
  const w = unbackedLayerWarning("backend-x", 486 * 1024 * 1024);
  assert.ok(w?.startsWith("backend-x holds 486 MB written inside the container"));
});
