import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { CoolifyClient, coolifySlot, retryDelayMs } from "../src/lib/coolify";

test("a 429 waits what Coolify asks (Retry-After), else 2, 4, 8 s, never more than 65 s", () => {
  assert.equal(retryDelayMs(0, "3"), 3000);
  assert.equal(retryDelayMs(0, "0"), 1000);
  assert.equal(retryDelayMs(0, "600"), 65_000);
  assert.equal(retryDelayMs(0, new Date(Date.parse("2026-10-08T00:00:10Z")).toUTCString(), Date.parse("2026-10-08T00:00:00Z")), 10_000);
  assert.deepEqual([0, 1, 2, 3, 10].map((a) => retryDelayMs(a, null)), [2000, 4000, 8000, 16000, 65_000]);
});

test("calls to one instance are paced: a burst, then the rate", async () => {
  const key = `pace-${Math.random()}`;
  const start = Date.now();
  // 240 a minute = 4 a second, bursts of 60: the 61st call waits ~250 ms.
  for (let i = 0; i < 60; i++) await coolifySlot(key, 240);
  assert.ok(Date.now() - start < 150, "the burst goes through at once");
  await coolifySlot(key, 240);
  assert.ok(Date.now() - start >= 200, "then the rate applies");
  // Another instance has its own budget.
  const other = Date.now();
  await coolifySlot(`${key}-other`, 240);
  assert.ok(Date.now() - other < 50);
});

test("a call that gets 429 is retried and succeeds, instead of failing the backup", { timeout: 20_000 }, async () => {
  let calls = 0;
  const srv = http.createServer((req, res) => {
    calls++;
    if (calls <= 2) {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
      res.end(JSON.stringify({ message: "Too Many Attempts." }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ uuid: "app1", name: "web" }));
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  try {
    const client = new CoolifyClient(`http://127.0.0.1:${port}`, "t");
    const started = Date.now();
    const app = await client.getApplication("app1");
    assert.equal(app.name, "web");
    assert.equal(calls, 3);
    assert.ok(Date.now() - started >= 2000, "waited Retry-After twice");
  } finally {
    srv.close();
  }
});
