import { test } from "node:test";
import assert from "node:assert/strict";
import { agentUpdateState, scheduleSoon, targetImage } from "../src/lib/agent-update";

const now = new Date("2026-10-09T10:00:00Z");
const agent = (over: Partial<Parameters<typeof agentUpdateState>[0]> = {}) => ({
  status: "online",
  lastSeenAt: new Date(now.getTime() - 10_000),
  version: "2.6.0",
  image: "ghcr.io/holo795/cbm-agent:latest",
  selfUpdate: "ok",
  ...over,
});

test("agent update state against the controller's version", () => {
  assert.equal(agentUpdateState(agent(), now, "2.6.0").kind, "current");
  assert.equal(agentUpdateState(agent(), now, "2.6.1").kind, "update");
  assert.equal(agentUpdateState(agent({ version: "2.7.0" }), now, "2.6.1").kind, "newer");
  assert.equal(agentUpdateState(agent({ version: null }), now, "2.6.1").kind, "unknown");
  // Before 2.6.0 an agent can't update itself.
  assert.deepEqual(agentUpdateState(agent({ version: "2.5.1" }), now, "2.6.0"), { kind: "manual", reason: "old" });
  assert.deepEqual(agentUpdateState(agent({ selfUpdate: "compose" }), now, "2.6.1"), { kind: "manual", reason: "compose" });
  assert.equal(agentUpdateState(agent({ lastSeenAt: new Date(now.getTime() - 10 * 60_000) }), now, "2.6.1").kind, "offline");
  assert.equal(agentUpdateState(agent({ status: "offline" }), now, "2.6.1").kind, "offline");
});

test("an agent updates from its own repository, at the controller's version", () => {
  assert.equal(targetImage("ghcr.io/holo795/cbm-agent:latest", "2.6.1"), "ghcr.io/holo795/cbm-agent:2.6.1");
  assert.equal(targetImage("registry.lan:5000/mirror/cbm-agent:2.6.0", "2.6.1"), "registry.lan:5000/mirror/cbm-agent:2.6.1");
  assert.equal(targetImage("ghcr.io/holo795/cbm-agent@sha256:abc", "2.6.1"), "ghcr.io/holo795/cbm-agent:2.6.1");
  // Unknown image: the configured AGENT_IMAGE.
  assert.match(targetImage(null, "2.6.1"), /cbm-agent:2\.6\.1$/);
});

test("a scheduled backup due soon keeps automatic updates away", () => {
  const at = new Date("2026-10-09T01:40:00Z");
  assert.equal(scheduleSoon(["0 2 * * *"], at, "UTC"), true);
  assert.equal(scheduleSoon(["0 3 * * *"], at, "UTC"), false);
  // Evaluated in the configured timezone: 02:00 in Paris is 00:00 UTC in October.
  assert.equal(scheduleSoon(["0 2 * * *"], new Date("2026-10-08T23:45:00Z"), "Europe/Paris"), true);
  assert.equal(scheduleSoon(["not a cron"], at, "UTC"), false);
});
