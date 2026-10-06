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
