import { test } from "node:test";
import assert from "node:assert/strict";
import { agentForServer } from "../src/lib/jobs";

const agent = (id: string, serverUuid: string | null) => ({ id, serverUuid });

test("a job goes to the agent on the resource's server", () => {
  const online = [agent("x", "srv-x"), agent("y", "srv-y")];
  assert.equal(agentForServer(online, "srv-y")?.id, "y");
});

test("never to an agent known to be on another server, even the only one online", () => {
  // The resource's agent is offline: its backup used to go to the other host and
  // end "skipped" every night, without an alert.
  assert.equal(agentForServer([agent("x", "srv-x")], "srv-y"), null);
  assert.equal(agentForServer([agent("x", "srv-x"), agent("z", "srv-z")], "srv-y"), null);
});

test("the only online agent whose server isn't known yet can take it", () => {
  assert.equal(agentForServer([agent("x", null)], "srv-y")?.id, "x");
  assert.equal(agentForServer([agent("x", null), agent("z", null)], "srv-y"), null);
});

test("a resource on an unknown server goes to the most recently seen online agent", () => {
  assert.equal(agentForServer([agent("x", "srv-x"), agent("y", "srv-y")], null)?.id, "x");
  assert.equal(agentForServer([], null), null);
});
