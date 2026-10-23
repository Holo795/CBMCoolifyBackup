import { test } from "node:test";
import assert from "node:assert/strict";
import { RESTIC_PART_META, resticPartIds } from "@cbm/shared";

test("restic part ids come from the manifest's artifacts, once each", () => {
  const manifest: { artifacts: Array<{ meta?: Record<string, string> }> } = {
    artifacts: [
      { meta: { volume: "a", [RESTIC_PART_META]: "p1" } },
      { meta: { engine: "postgresql" } },
      { meta: { volume: "b", [RESTIC_PART_META]: "p2" } },
      { meta: { volume: "c", [RESTIC_PART_META]: "p1" } },
      {},
    ],
  };
  assert.deepEqual(resticPartIds(manifest), ["p1", "p2"]);
  assert.deepEqual(resticPartIds(null), []);
  assert.deepEqual(resticPartIds({}), []);
});

test("a clone's host mounts: those in the original's folder move to the clone's", async () => {
  const { buildBindMap } = await import("../src/lib/jobs");
  const m = {
    artifacts: [
      { kind: "volume", filename: "a.tar", meta: { bindSource: "/data/coolify/services/olduuid/html" } },
      { kind: "volume", filename: "b.tar", meta: { bindSource: "/data/coolify/services/olduuid/auth/htpasswd", bindKind: "file" } },
      { kind: "volume", filename: "c.tar", meta: { bindSource: "/srv/shared/olduuidx/data" } },
      { kind: "volume", filename: "d.tar", meta: { volume: "olduuid_data" } },
    ],
  } as never;
  assert.deepEqual(buildBindMap(m, "olduuid", "newuuid"), {
    "/data/coolify/services/olduuid/html": "/data/coolify/services/newuuid/html",
    "/data/coolify/services/olduuid/auth/htpasswd": "/data/coolify/services/newuuid/auth/htpasswd",
  });
  assert.equal(buildBindMap({ artifacts: [] } as never, "a", "b"), undefined);
});
