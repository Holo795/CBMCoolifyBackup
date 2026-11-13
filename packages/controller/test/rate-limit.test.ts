import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, clientIp, makeTrustedMatcher, trustedProxyList } from "../src/lib/rate-limit";

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

test("clientIp reads X-Forwarded-For right to left, past the trusted proxies", () => {
  const req = (xff: string) => new Request("http://x/", { headers: { "x-forwarded-for": xff } });
  const none = { trusted: () => false };
  // One proxy appending the address it saw: that rightmost one is the client,
  // whatever the client put first.
  assert.equal(clientIp(req("1.2.3.4, 203.0.113.7"), none), "203.0.113.7");
  assert.equal(clientIp(req("203.0.113.7"), none), "203.0.113.7");
  // Two proxies, the inner one trusted.
  const trusted = { trusted: makeTrustedMatcher(trustedProxyList("10.0.0.0/8, 172.18.0.5, fd00::/8")) };
  assert.equal(clientIp(req("1.2.3.4, 203.0.113.7, 10.1.2.3"), trusted), "203.0.113.7");
  assert.equal(clientIp(req("203.0.113.7, 172.18.0.5"), trusted), "203.0.113.7");
  assert.equal(clientIp(req("2001:db8::1, fd00::2"), trusted), "2001:db8::1");
  assert.equal(clientIp(req("198.51.100.9, ::ffff:10.0.0.1"), trusted), "198.51.100.9");
  // A single header the proxy sets.
  const cf = new Request("http://x/", { headers: { "cf-connecting-ip": "198.51.100.2", "x-forwarded-for": "6.6.6.6" } });
  assert.equal(clientIp(cf, { header: "cf-connecting-ip" }), "198.51.100.2");
  const real = new Request("http://x/", { headers: { "x-real-ip": "198.51.100.2" } });
  assert.equal(clientIp(real, none), "198.51.100.2");
  assert.equal(clientIp(new Request("http://x/"), none), "unknown");
});
