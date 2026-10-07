import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { LookupAddress } from "node:dns";
import { cachingLookup, controllerFetch, describeHttpError } from "../src/http.js";
import { PollHealth, WARN_AFTER, REMIND_EVERY, withQuickRetries } from "../src/poll-health.js";

const call = (lookup: ReturnType<typeof cachingLookup>, opts: { all?: boolean; family?: number } = {}) =>
  new Promise<{ err: NodeJS.ErrnoException | null; address: string | LookupAddress[]; family?: number }>((resolve) =>
    lookup("ctl.example", opts, (err, address, family) => resolve({ err, address, family })),
  );

test("the controller's name is resolved once a minute, and the last answer survives a flaky resolver", async () => {
  let t = 0;
  let calls = 0;
  let fail = false;
  const addresses: LookupAddress[] = [
    { address: "2001:db8::1", family: 6 },
    { address: "192.0.2.10", family: 4 },
  ];
  const lookup = cachingLookup((_h, cb) => {
    calls++;
    if (fail) return cb(Object.assign(new Error("getaddrinfo EAI_AGAIN"), { code: "EAI_AGAIN" }), []);
    cb(null, addresses);
  }, () => t);

  assert.deepEqual(await call(lookup, { family: 4 }), { err: null, address: "192.0.2.10", family: 4 });
  assert.deepEqual((await call(lookup, { all: true })).address, addresses);
  assert.equal(calls, 1, "cached for a minute");

  t = 61_000;
  fail = true;
  assert.equal((await call(lookup, { family: 4 })).address, "192.0.2.10", "stale answer while the resolver fails");
  assert.equal(calls, 2);

  t = 3_700_000; // past an hour: the failure goes through
  assert.equal((await call(lookup)).err?.code, "EAI_AGAIN");
});

test("a failed request says why", () => {
  const e = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo EAI_AGAIN ctl"), { code: "EAI_AGAIN" }) });
  assert.equal(describeHttpError(e), "fetch failed (EAI_AGAIN)");
  assert.equal(describeHttpError(new Error("poll failed: 502 Bad Gateway")), "poll failed: 502 Bad Gateway");
});

test("unreachable is a warning only after a few failed polls in a row, then now and then", () => {
  const h = new PollHealth();
  const levels = Array.from({ length: WARN_AFTER + REMIND_EVERY }, () => h.failed("fetch failed (EAI_AGAIN)").level);
  assert.equal(levels.filter((l) => l === "warn").length, 2);
  assert.equal(levels[WARN_AFTER - 1], "warn");
  assert.match(h.succeeded()!.message, /reachable again after 63 failed polls/);
  assert.equal(h.succeeded(), null);
  h.failed("x");
  assert.equal(h.succeeded(), null, "one blip, nothing to say");
});

test("a poll gets quick retries, but not on an auth error", async () => {
  let n = 0;
  const flaky = () => (++n < 3 ? Promise.reject(new Error("fetch failed")) : Promise.resolve("ok"));
  assert.equal(await withQuickRetries(flaky, [1, 1], async () => {}), "ok");
  n = 0;
  await assert.rejects(withQuickRetries(() => (n++, Promise.reject(new Error("poll failed: 401"))), [1, 1], async () => {}));
  assert.equal(n, 1);
});

test("requests to the controller go through the cached resolution", async () => {
  const server = createServer((_req, res) => res.end("pong"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  try {
    const res = await controllerFetch(`http://localhost:${port}/`, { method: "GET" });
    assert.equal(await res.text(), "pong");
  } finally {
    server.close();
  }
  // Nothing listens there any more: the cause is named.
  await assert.rejects(controllerFetch(`http://localhost:${port}/`, { method: "GET" }), (e) =>
    /fetch failed \(ECONNREFUSED\)/.test(describeHttpError(e)),
  );
});
