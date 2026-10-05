import { test } from "node:test";
import assert from "node:assert/strict";
import { CbmClient, CbmError } from "../src/client.ts";

type Captured = { url: string; init: RequestInit | undefined };

/** Swap global.fetch for one call; capture the request and return `res`. */
function withFetch(res: Response | (() => never), run: (cap: () => Captured) => Promise<void>) {
  const original = globalThis.fetch;
  let captured: Captured | undefined;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    captured = { url: String(input), init };
    if (typeof res === "function") return res();
    return res;
  }) as typeof fetch;
  return run(() => captured!).finally(() => {
    globalThis.fetch = original;
  });
}

test("GET sends the bearer token and builds query params", async () => {
  const client = new CbmClient("https://cbm.example.com/", "tok_123");
  await withFetch(Response.json({ items: [] }), async (cap) => {
    const out = await client.listResources({ instanceId: "i1", backupEnabled: true });
    assert.deepEqual(out, { items: [] });
    const { url, init } = cap();
    assert.equal(url, "https://cbm.example.com/api/v1/resources?instanceId=i1&backupEnabled=true");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer tok_123");
    assert.equal(init?.method, "GET");
  });
});

test("trailing slash in base URL is normalised", async () => {
  const client = new CbmClient("https://cbm.example.com//", "t");
  await withFetch(Response.json({ ok: true }), async (cap) => {
    await client.whoami();
    assert.equal(cap().url, "https://cbm.example.com/api/v1/whoami");
  });
});

test("undefined query params are omitted", async () => {
  const client = new CbmClient("https://cbm.example.com", "t");
  await withFetch(Response.json({ items: [] }), async (cap) => {
    await client.listSnapshots({ limit: 10 });
    assert.equal(cap().url, "https://cbm.example.com/api/v1/snapshots?limit=10");
  });
});

test("a non-2xx response throws CbmError with status and message", async () => {
  const client = new CbmClient("https://cbm.example.com", "t");
  await withFetch(Response.json({ error: "forbidden", need: "operator" }, { status: 403 }), async () => {
    await assert.rejects(
      () => client.backupResource("r1"),
      (e: unknown) => {
        assert.ok(e instanceof CbmError);
        assert.equal(e.status, 403);
        assert.match(e.message, /HTTP 403: forbidden/);
        return true;
      },
    );
  });
});

test("a network failure throws CbmError with status 0", async () => {
  const client = new CbmClient("https://cbm.example.com", "t");
  await withFetch(
    () => {
      throw new Error("ECONNREFUSED");
    },
    async () => {
      await assert.rejects(
        () => client.whoami(),
        (e: unknown) => {
          assert.ok(e instanceof CbmError);
          assert.equal(e.status, 0);
          assert.match(e.message, /Cannot reach CBM/);
          return true;
        },
      );
    },
  );
});

test("POST test-restore targets the snapshot drill endpoint", async () => {
  const client = new CbmClient("https://cbm.example.com", "t");
  await withFetch(Response.json({ queued: true }, { status: 202 }), async (cap) => {
    await client.drillSnapshot("s/1");
    const { url, init } = cap();
    assert.equal(url, "https://cbm.example.com/api/v1/snapshots/s%2F1/drill");
    assert.equal(init?.method, "POST");
  });
});

test("POST verify passes the deep flag", async () => {
  const client = new CbmClient("https://cbm.example.com", "t");
  await withFetch(Response.json({ queued: 1 }), async (cap) => {
    await client.verifyDestination("d1", true);
    const { url, init } = cap();
    assert.equal(url, "https://cbm.example.com/api/v1/destinations/d1/verify?deep=true");
    assert.equal(init?.method, "POST");
  });
});
