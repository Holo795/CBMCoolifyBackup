import { test } from "node:test";
import assert from "node:assert/strict";
import { startupProblems, DEFAULT_AUTH_SECRET } from "../src/lib/startup-check";

const GOOD_KEY = Buffer.alloc(32, 7).toString("base64");

test("development never blocks", () => {
  assert.deepEqual(startupProblems({ nodeEnv: "development", authSecret: DEFAULT_AUTH_SECRET, masterKey: "nope" }), []);
});

test("production refuses the default or a missing auth secret", () => {
  assert.equal(startupProblems({ nodeEnv: "production", authSecret: DEFAULT_AUTH_SECRET }).length, 1);
  assert.equal(startupProblems({ nodeEnv: "production", authSecret: "" }).length, 1);
  assert.equal(startupProblems({ nodeEnv: "production" }).length, 1);
});

test("production refuses a MASTER_KEY that is set but invalid", () => {
  const p = startupProblems({ nodeEnv: "production", authSecret: "a-long-random-secret", masterKey: "too-short" });
  assert.equal(p.length, 1);
  assert.match(p[0], /MASTER_KEY/);
});

test("production accepts a real secret with a valid or empty MASTER_KEY", () => {
  assert.deepEqual(startupProblems({ nodeEnv: "production", authSecret: "a-long-random-secret", masterKey: GOOD_KEY }), []);
  assert.deepEqual(startupProblems({ nodeEnv: "production", authSecret: "a-long-random-secret", masterKey: "" }), []);
  assert.deepEqual(startupProblems({ nodeEnv: "production", authSecret: "a-long-random-secret" }), []);
});
