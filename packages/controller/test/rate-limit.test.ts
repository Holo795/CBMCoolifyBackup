import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, clientIp } from "../src/lib/rate-limit";

test("allows up to max requests in a window, then blocks", () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 3 });
  const t = 10_000;
  assert.equal(rl.check("ip:a", t).ok, true);
  assert.equal(rl.check("ip:a", t).ok, true);
  const third = rl.check("ip:a", t);
  assert.equal(third.ok, true);
  assert.equal(third.remaining, 0);
  const blocked = rl.check("ip:a", t + 100);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterMs, 900);
});

test("keys are isolated from each other", () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(rl.check("ip:a", 0).ok, true);
  assert.equal(rl.check("ip:a", 0).ok, false);
  assert.equal(rl.check("ip:b", 0).ok, true);
});

test("the budget resets once the window has passed", () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(rl.check("k", 0).ok, true);
  assert.equal(rl.check("k", 500).ok, false);
  assert.equal(rl.check("k", 1000).ok, true);
});

test("sweep drops expired buckets but keeps live ones", () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 1 });
  rl.check("old", 0);
  rl.check("live", 900);
  rl.sweep(1500);
  // "old" was swept → fresh budget; "live" still blocked until 1900.
  assert.equal(rl.check("old", 1500).ok, true);
  assert.equal(rl.check("live", 1500).ok, false);
});

test("clientIp prefers the first X-Forwarded-For hop, then X-Real-IP", () => {
  const xff = new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
  assert.equal(clientIp(xff), "203.0.113.7");
  const real = new Request("http://x/", { headers: { "x-real-ip": "198.51.100.2" } });
  assert.equal(clientIp(real), "198.51.100.2");
  assert.equal(clientIp(new Request("http://x/")), "unknown");
});
