import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, isLoopback } from "../src/config.ts";

const KEYS = ["CBM_URL", "CBM_TOKEN", "CBM_MCP_TRANSPORT", "CBM_MCP_HOST", "CBM_MCP_PORT", "CBM_MCP_AUTH_TOKEN"];

function withEnv(env: Record<string, string>, fn: () => void) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("isLoopback", () => {
  assert.equal(isLoopback("127.0.0.1"), true);
  assert.equal(isLoopback("localhost"), true);
  assert.equal(isLoopback("::1"), true);
  assert.equal(isLoopback("0.0.0.0"), false);
  assert.equal(isLoopback("192.168.1.10"), false);
});

test("a server-wide token on a network address needs an inbound auth token", () => {
  withEnv({ CBM_URL: "http://cbm", CBM_TOKEN: "t", CBM_MCP_TRANSPORT: "http", CBM_MCP_HOST: "0.0.0.0" }, () => {
    assert.throws(() => loadConfig(), /CBM_MCP_AUTH_TOKEN/);
  });
  withEnv(
    { CBM_URL: "http://cbm", CBM_TOKEN: "t", CBM_MCP_TRANSPORT: "http", CBM_MCP_HOST: "0.0.0.0", CBM_MCP_AUTH_TOKEN: "s" },
    () => assert.equal(loadConfig().mcpAuthToken, "s"),
  );
});

test("a server-wide token on loopback, or per-agent tokens anywhere, need nothing more", () => {
  withEnv({ CBM_URL: "http://cbm", CBM_TOKEN: "t", CBM_MCP_TRANSPORT: "http" }, () => {
    assert.equal(loadConfig().host, "127.0.0.1");
  });
  withEnv({ CBM_URL: "http://cbm", CBM_MCP_TRANSPORT: "http", CBM_MCP_HOST: "0.0.0.0" }, () => {
    assert.equal(loadConfig().cbmToken, undefined);
  });
});

test("an inbound auth token without a server-wide CBM token is a mistake", () => {
  withEnv({ CBM_URL: "http://cbm", CBM_MCP_TRANSPORT: "http", CBM_MCP_AUTH_TOKEN: "s" }, () => {
    assert.throws(() => loadConfig(), /only applies/);
  });
});
