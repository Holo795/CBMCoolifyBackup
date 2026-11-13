import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { CoolifyClient } from "../src/lib/coolify";

/** A fake Coolify answering each listing path with a status and a body. */
async function fakeCoolify(routes: Record<string, [number, unknown]>, run: (client: CoolifyClient) => Promise<void>) {
  const srv = http.createServer((req, res) => {
    const [status, body] = routes[req.url ?? ""] ?? [404, { message: "Not found" }];
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => srv.listen(0, r));
  try {
    await run(new CoolifyClient(`http://127.0.0.1:${(srv.address() as { port: number }).port}`, "t"));
  } finally {
    srv.close();
  }
}

const projects: [number, unknown] = [
  200,
  [{ uuid: "p1", name: "shop", environments: [{ id: 1, name: "production", uuid: "e1" }] }],
];

test("a complete listing returns every resource with its project and environment", async () => {
  await fakeCoolify(
    {
      "/api/v1/projects": projects,
      "/api/v1/applications": [200, [{ uuid: "a1", name: "web", environment_id: 1 }]],
      "/api/v1/databases": [200, [{ uuid: "d1", name: "db", type: "standalone-postgresql", environment_id: 1 }]],
      "/api/v1/services": [200, []],
    },
    async (client) => {
      const list = await client.listResources();
      assert.deepEqual(
        list.map((r) => [r.uuid, r.type, r.projectName, r.environment]),
        [
          ["a1", "application", "shop", "production"],
          ["d1", "postgresql", "shop", "production"],
        ],
      );
    },
  );
});

test("a listing that fails fails the discovery instead of looking empty", async () => {
  for (const failing of ["/api/v1/applications", "/api/v1/databases", "/api/v1/services", "/api/v1/projects"]) {
    const routes: Record<string, [number, unknown]> = {
      "/api/v1/projects": projects,
      "/api/v1/applications": [200, [{ uuid: "a1", name: "web", environment_id: 1 }]],
      "/api/v1/databases": [200, []],
      "/api/v1/services": [200, []],
    };
    routes[failing] = [502, { message: "Bad gateway" }];
    await fakeCoolify(routes, async (client) => {
      await assert.rejects(client.listResources(), new RegExp(`${failing} -> 502`), failing);
    });
  }
});

test("a body that isn't a list fails the discovery; a missing endpoint is an empty list", async () => {
  await fakeCoolify(
    {
      "/api/v1/projects": projects,
      "/api/v1/applications": [200, { message: "API is disabled." }],
      "/api/v1/databases": [200, []],
    },
    async (client) => {
      await assert.rejects(client.listResources(), /expected a list/);
    },
  );
  await fakeCoolify(
    {
      "/api/v1/projects": projects,
      "/api/v1/applications": [200, [{ uuid: "a1", name: "web", environment_id: 1 }]],
      "/api/v1/databases": [200, []],
      // no /api/v1/services: an older Coolify
    },
    async (client) => {
      assert.deepEqual((await client.listResources()).map((r) => r.uuid), ["a1"]);
    },
  );
});
