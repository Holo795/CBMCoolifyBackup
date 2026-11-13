import { test } from "node:test";
import assert from "node:assert/strict";
import { pingDue } from "../src/lib/ping";

test("CBM pings its monitor while it runs and an agent answers, never on hold", () => {
  assert.deepEqual(pingDue({ agents: [{ status: "online" }, { status: "offline" }], onHold: false }), { ping: true });
  assert.deepEqual(pingDue({ agents: [], onHold: false }), { ping: true });
  assert.equal(pingDue({ agents: [{ status: "offline" }], onHold: false }).ping, false);
  assert.equal(pingDue({ agents: [{ status: "online" }], onHold: true }).ping, false);
});
