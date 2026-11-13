import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResourceDescriptor } from "@cbm/shared";
import { belongsToResource, containersToStopForRestore } from "../src/resolve.js";
import { docker } from "../src/docker.js";

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";

test("a container is the resource's by its uuid in the name or a Coolify label", () => {
  assert.equal(belongsToResource("k8s0abc-121314151617", undefined, "k8s0abc"), true);
  assert.equal(belongsToResource("web", { "coolify.resourceUuid": "k8s0abc" }, "k8s0abc"), true);
  assert.equal(belongsToResource("other-app", { "coolify.resourceUuid": "zzz" }, "k8s0abc"), false);
  assert.equal(belongsToResource("coolify-db", undefined, "coolify-self"), true);
  assert.equal(belongsToResource("someapp", undefined, "coolify-self"), false);
});

test(
  "in place after a redeploy: the renamed container is stopped, another resource's is refused",
  { skip: !DOCKER, timeout: 120_000 },
  async () => {
    const stamp = Date.now().toString(36);
    const uuid = `cbmrt${stamp}`;
    const volume = `${uuid}_data`;
    const deployed = `${uuid}-${stamp}2`; // the name after a redeploy
    const stranger = `cbm-restore-stranger-${stamp}`;
    try {
      assert.equal((await docker(["volume", "create", volume])).code, 0);
      const run = (name: string) =>
        docker(["run", "-d", "--name", name, "--network", "none", "-v", `${volume}:/data`, "alpine:3.24", "sleep", "300"]);
      assert.equal((await run(deployed)).code, 0);
      // The snapshot recorded the name before the redeploy, long gone.
      const resource = {
        coolifyUuid: uuid,
        name: "web",
        type: "application",
        containerName: `${uuid}-${stamp}1`,
        containerNames: [`${uuid}-${stamp}1`],
        volumes: [volume],
      } as unknown as ResourceDescriptor;

      const mine = await containersToStopForRestore(resource, [volume]);
      assert.deepEqual(mine.stop, [deployed]);
      assert.deepEqual(mine.foreign, []);

      // Another resource mounting the same volume: never stopped, reported.
      assert.equal((await run(stranger)).code, 0);
      const shared = await containersToStopForRestore(resource, [volume]);
      assert.ok(shared.stop.includes(deployed));
      assert.deepEqual(shared.foreign, [stranger]);
    } finally {
      await docker(["rm", "-f", deployed, stranger]);
      await docker(["volume", "rm", "-f", volume]);
    }
  },
);
