import { test } from "node:test";
import assert from "node:assert/strict";
import { backupOutcome, unbackedLayerWarning, captureErrorWarning, configOnlyFailure, LAYER_WARN_BYTES } from "../src/outcome.js";

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

test("a failed Coolify read is logged and fails a configuration-only backup", () => {
  assert.equal(captureErrorWarning(undefined), null);
  assert.match(captureErrorWarning("Coolify API: environment variables: 502") ?? "", /can't recreate its environment/);
  assert.equal(configOnlyFailure("config", undefined), null);
  assert.equal(configOnlyFailure("data", "Coolify API: boom"), null, "data snapshots are kept");
  assert.equal(configOnlyFailure("skip", "Coolify API: boom"), null);
  assert.equal(configOnlyFailure("config", "Coolify API: boom"), "Configuration-only backup failed: Coolify API: boom");
});

test("read-only host mounts outside the resource's folder are reported, unless excluded", async () => {
  const { skippedMountWarnings } = await import("../src/outcome.js");
  const { inResourceFolder } = await import("../src/resolve.js");
  assert.equal(inResourceFolder("/data/coolify/services/abc123/php/zz.ini", "abc123"), true);
  assert.equal(inResourceFolder("/data/coolify/services/abc1234/php/zz.ini", "abc123"), false);
  assert.equal(inResourceFolder("/etc/ssl/certs/ca.pem", "abc123"), false);
  const w = skippedMountWarnings(["/srv/shared/ca.pem", "/var/log/app/", "/opt/keep"], ["host:/var/log/app", "/opt/keep/"]);
  assert.equal(w.length, 1);
  assert.match(w[0], /^Read-only host mount \/srv\/shared\/ca\.pem not backed up/);
});
