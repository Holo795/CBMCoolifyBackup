import { test } from "node:test";
import assert from "node:assert/strict";
import { minutesToEvaluate } from "../src/lib/scheduler";

const M = 29_000_000; // an arbitrary epoch minute
const at = (minute: number, sec = 5) => minute * 60_000 + sec * 1000;

test("first run evaluates the current minute only", () => {
  assert.deepEqual(minutesToEvaluate(null, at(M)), [M]);
});

test("the same minute is never evaluated twice", () => {
  assert.deepEqual(minutesToEvaluate(M, at(M, 50)), []);
});

test("minutes skipped by a slow tick are replayed, in order", () => {
  assert.deepEqual(minutesToEvaluate(M, at(M + 3)), [M + 1, M + 2, M + 3]);
});

test("a long pause replays at most the last 15 minutes", () => {
  const out = minutesToEvaluate(M, at(M + 600));
  assert.equal(out.length, 15);
  assert.equal(out[0], M + 586);
  assert.equal(out[14], M + 600);
});
