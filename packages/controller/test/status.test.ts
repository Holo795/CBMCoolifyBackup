import { test } from "node:test";
import assert from "node:assert/strict";
import { resourceStatusLabel, resourceStatusTone } from "../src/lib/status";
import { statusTone } from "../src/components/ui/badge";
import { makeT } from "../src/lib/i18n-shared";

test("resource status colours follow what is actually running", () => {
  assert.equal(resourceStatusTone("running:healthy"), "success");
  assert.equal(resourceStatusTone("running:unknown"), "success", "no healthcheck is still running");
  assert.equal(resourceStatusTone("running"), "success");
  assert.equal(resourceStatusTone("running:unhealthy"), "warning");
  assert.equal(resourceStatusTone("degraded:unhealthy"), "warning");
  assert.equal(resourceStatusTone("exited:unhealthy"), "danger");
  assert.equal(resourceStatusTone("exited"), "danger");
  assert.equal(resourceStatusTone("restarting:unhealthy"), "neutral");
  assert.equal(resourceStatusTone(null), "neutral");
});

test("resource status labels say what the health part means", () => {
  const fr = makeT("fr");
  const en = makeT("en");
  assert.equal(resourceStatusLabel(fr, "running:healthy"), "en cours");
  assert.equal(resourceStatusLabel(fr, "running:unknown"), "en cours (sans healthcheck)");
  assert.equal(resourceStatusLabel(en, "running:unhealthy"), "running (healthcheck failing)");
  assert.equal(resourceStatusLabel(fr, "exited:unhealthy"), "arrêté");
  assert.equal(resourceStatusLabel(fr, "degraded:unhealthy"), "dégradé");
  assert.equal(resourceStatusLabel(fr, "restarting:unhealthy"), "redémarrage (défaillant)");
  assert.equal(resourceStatusLabel(en, "weird:thing"), "weird (thing)");
});

test("statusTone no longer reads unhealthy as healthy", () => {
  assert.equal(statusTone("running:unhealthy"), "danger");
  assert.equal(statusTone("exited:unhealthy"), "danger");
  assert.equal(statusTone("running:healthy"), "success");
  assert.equal(statusTone("succeeded"), "success");
  assert.equal(statusTone("failed"), "danger");
});
