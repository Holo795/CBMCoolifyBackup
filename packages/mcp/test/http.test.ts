import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { runHttp } from "../src/http.ts";
import type { Config } from "../src/config.ts";

const base: Config = {
  cbmUrl: "http://127.0.0.1:9",
  cbmToken: undefined,
  mcpAuthToken: undefined,
  transport: "http",
  host: "127.0.0.1",
  port: 0,
};

async function withServer(cfg: Partial<Config>, fn: (port: number) => Promise<void>) {
  const server = await runHttp({ ...base, ...cfg });
  try {
    await fn((server.address() as AddressInfo).port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

/** Raw POST so the Host header can be set freely (fetch forbids it). */
function post(port: number, headers: Record<string, string>, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end(body);
  });
}

const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });

test("a server-wide token requires the MCP auth token", async () => {
  await withServer({ cbmToken: "cbm", mcpAuthToken: "secret" }, async (port) => {
    assert.equal(await post(port, { "content-type": "application/json" }, ping), 401);
    assert.equal(await post(port, { authorization: "Bearer nope" }, ping), 401);
    assert.notEqual(await post(port, { authorization: "Bearer secret", "content-type": "application/json", accept: "application/json, text/event-stream" }, ping), 401);
  });
});

test("forwarding mode needs a bearer token", async () => {
  await withServer({}, async (port) => {
    assert.equal(await post(port, {}, ping), 401);
  });
});

test("a body over 1 MiB is refused with 413", async () => {
  await withServer({}, async (port) => {
    assert.equal(await post(port, { authorization: "Bearer t" }, "x".repeat(1024 * 1024 + 1)), 413);
  });
});

test("a loopback server refuses a foreign Host header (DNS rebinding)", async () => {
  await withServer({}, async (port) => {
    assert.equal(await post(port, { authorization: "Bearer t", host: "evil.example:80" }, ping), 403);
    assert.notEqual(await post(port, { authorization: "Bearer t", host: `localhost:${port}` }, ping), 403);
  });
});
