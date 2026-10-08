import { test } from "node:test";
import assert from "node:assert/strict";
import { showsDumpLogin } from "../src/lib/dump-login";

const base = { type: "application", containers: null, dumpUser: null, lastSnapshotHasDump: false };

test("the dump login shows only for a resource with a database", () => {
  assert.equal(showsDumpLogin(base), false);
  assert.equal(showsDumpLogin({ ...base, containers: [{ name: "web" }, { name: "cache", engine: "redis" }] }), false);
  assert.equal(showsDumpLogin({ ...base, type: "service", containers: [{ name: "db", engine: "mariadb" }] }), true);
  assert.equal(showsDumpLogin({ ...base, type: "postgresql" }), true);
  assert.equal(showsDumpLogin({ ...base, type: "redis" }), false);
  // An agent that doesn't report engines yet: the last backup had a dump.
  assert.equal(showsDumpLogin({ ...base, lastSnapshotHasDump: true }), true);
  // A login already set stays reachable, to change or remove it.
  assert.equal(showsDumpLogin({ ...base, dumpUser: "backup" }), true);
});
