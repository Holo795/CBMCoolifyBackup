import { test } from "node:test";
import assert from "node:assert/strict";
import { groupContainersByResource, matchHookTargets } from "../src/hooks.js";
import { runCapture } from "../src/proc.js";
import { docker, execShell } from "../src/docker.js";

const SVC = "w4k8gcs0oogkg0wg4kc8oowc"; // a Coolify service uuid
const APP = "j4c8w0ggk8o8kc4ow0s04w48"; // a Coolify application uuid
const DB = "dbuuidabcdefghijklmnopqr";

const ps = [
  // compose service containers: <name>-<serviceUuid>, labelled with the compose service
  `app-${SVC}\tapp\tcom.docker.compose.service=app,coolify.serviceId=${SVC}\t${SVC}_uploads`,
  `worker-${SVC}\tworker\tcom.docker.compose.service=worker\t`,
  `postgres-${SVC}\tpostgres\tcom.docker.compose.service=postgres\t${SVC}_pgdata`,
  // an app container renamed on each deploy: <uuid>-<timestamp>
  `${APP}-142233123456\t\tcoolify.applicationId=12\t`,
  // only linked through a mounted volume
  `sidecar\t\t\t${DB}_data`,
  // Coolify's own infra: no uuid → not a resource
  `coolify-db\t\tcoolify.managed=true\tcoolify-db`,
  "",
].join("\n");

test("groups containers by resource uuid (name, labels, mounted volumes)", () => {
  const g = groupContainersByResource(ps);
  assert.deepEqual(g[SVC], [
    { name: `app-${SVC}`, service: "app" },
    { name: `postgres-${SVC}`, service: "postgres" },
    { name: `worker-${SVC}`, service: "worker" },
  ]);
  assert.deepEqual(g[APP], [{ name: `${APP}-142233123456` }]);
  assert.deepEqual(g[DB], [{ name: "sidecar" }]);
  assert.equal(Object.keys(g).some((k) => k.startsWith("coolify")), false);
});

test("caps the number of resources reported", () => {
  const many = Array.from({ length: 10 }, (_, i) => `c${i}-${"a".repeat(19)}${i}\t\t\t`).join("\n");
  assert.equal(Object.keys(groupContainersByResource(many, 3)).length, 3);
});

test("matchHookTargets: primary, exact name, compose service, nothing", () => {
  const inv = groupContainersByResource(ps)[SVC];
  assert.deepEqual(matchHookTargets("", inv, `app-${SVC}`), [`app-${SVC}`]);
  assert.deepEqual(matchHookTargets("", inv, undefined), []);
  assert.deepEqual(matchHookTargets(`worker-${SVC}`, inv), [`worker-${SVC}`]);
  assert.deepEqual(matchHookTargets("worker", inv), [`worker-${SVC}`]);
  // A target that matches nothing is NOT redirected to the primary.
  assert.deepEqual(matchHookTargets("gone", inv, `app-${SVC}`), []);
  // A container of another resource is never a valid target.
  assert.deepEqual(matchHookTargets("coolify-db", inv, `app-${SVC}`), []);
});

test("matchHookTargets runs in every replica of a compose service", () => {
  const inv = [
    { name: "worker-1", service: "worker" },
    { name: "worker-2", service: "worker" },
    { name: "web", service: "web" },
  ];
  assert.deepEqual(matchHookTargets("worker", inv), ["worker-1", "worker-2"]);
});

test("runCapture kills a process past its time limit", async () => {
  const t0 = Date.now();
  const r = await runCapture("sleep", ["5"], { timeoutMs: 200 });
  assert.equal(r.timedOut, true);
  assert.equal(r.code, 124);
  assert.ok(Date.now() - t0 < 2000);
});

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";

/** Processes whose exact command line is `sleep 60`, read from /proc (works without procps). */
async function sleepers(name: string): Promise<number> {
  const scan = "for p in /proc/[0-9]*; do tr '\\0' ' ' < $p/cmdline 2>/dev/null; echo; done | grep -cx 'sleep 60 ' || true";
  return Number((await docker(["exec", name, "sh", "-c", scan])).stdout.trim() || "0");
}

async function hookTimeoutCase(image: string, command: string) {
  const name = `cbm-hooktest-${Date.now()}`;
  try {
    const run = await docker(["run", "-d", "--name", name, "--network", "none", image, "sleep", "300"]);
    assert.equal(run.code, 0, run.stderr);
    const t0 = Date.now();
    const r = await execShell(name, command, 2);
    assert.notEqual(r.code, 0);
    assert.ok(Date.now() - t0 < 15_000, "returned well before the command would have finished");
    assert.doesNotMatch(r.stdout, /should-not-print/);
    await new Promise((res) => setTimeout(res, 500));
    assert.equal(await sleepers(name), 0, "the hook command was stopped inside the container");
    const ok = await execShell(name, "echo hi", 5);
    assert.equal(ok.code, 0);
    assert.equal(ok.stdout.trim(), "hi");
  } finally {
    await docker(["rm", "-f", name]);
  }
}

test("a timed-out hook is stopped inside an Alpine (busybox) container", { skip: !DOCKER, timeout: 120_000 }, () =>
  hookTimeoutCase("alpine:3.24", "sleep 60"),
);

test("a timed-out compound hook is fully stopped in a Debian (coreutils) container", { skip: !DOCKER, timeout: 180_000 }, () =>
  hookTimeoutCase("debian:bookworm-slim", "sleep 60; echo should-not-print"),
);

test("each reported container carries the image it runs, looked up by container id", async () => {
  const { containerIdsByName, withImageIds } = await import("../src/hooks.js");
  const uuid = "abcdefghij0123456789klmn";
  const ps = [
    `gitlab-${uuid}\tgitlab\tcoolify.serviceId=${uuid}\t\t0123456789ab`,
    `redis-${uuid}\tredis\tcoolify.serviceId=${uuid}\t\tba9876543210`,
  ].join("\n");
  const ids = containerIdsByName(ps);
  assert.equal(ids.get(`gitlab-${uuid}`), "0123456789ab");
  const out = withImageIds(groupContainersByResource(ps), ids, (id) => (id === "0123456789ab" ? "sha256:aaa" : undefined));
  assert.deepEqual(out[uuid], [
    { name: `gitlab-${uuid}`, service: "gitlab", imageId: "sha256:aaa" },
    { name: `redis-${uuid}`, service: "redis" },
  ]);
});
