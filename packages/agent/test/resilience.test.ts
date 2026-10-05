import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdtemp, readdir, stat, rm } from "node:fs/promises";
import { dumpRedis } from "../src/dump.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobResult } from "@cbm/shared";
import { deliverResult, flushPendingResults } from "../src/outbox.js";
import { initHeldContainers, holdContainer, releaseContainer, heldContainers } from "../src/held.js";
import { docker, pauseContainer, stopContainer, recoverHeldContainers, restoreRdbIntoVolume } from "../src/docker.js";

const result = (id = "job1"): JobResult => ({ jobId: id, status: "succeeded" }) as JobResult;
const httpError = (status: number) => Object.assign(new Error(`result failed: ${status}`), { status });
const fast = { baseDelayMs: 1 };

test("a result is sent at once when the controller answers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-outbox-"));
  try {
    let calls = 0;
    assert.equal(await deliverResult(dir, result(), async () => void calls++, fast), "sent");
    assert.equal(calls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("transient failures are retried", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-outbox-"));
  try {
    let calls = 0;
    const send = async () => {
      if (++calls < 3) throw httpError(503);
    };
    assert.equal(await deliverResult(dir, result(), send, fast), "sent");
    assert.equal(calls, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a definitive rejection (404) is dropped, not retried", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-outbox-"));
  try {
    let calls = 0;
    const send = async () => {
      calls++;
      throw httpError(404);
    };
    assert.equal(await deliverResult(dir, result(), send, fast), "dropped");
    assert.equal(calls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an unreachable controller keeps the result on disk (0600) and it is resent later", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-outbox-"));
  try {
    const down = async () => {
      throw new Error("ECONNREFUSED");
    };
    assert.equal(await deliverResult(dir, result("job/7"), down, { ...fast, attempts: 2 }), "queued");
    const files = await readdir(join(dir, "pending-results"));
    assert.equal(files.length, 1);
    assert.equal((await stat(join(dir, "pending-results", files[0]))).mode & 0o777, 0o600);

    // Still down: kept.
    assert.deepEqual(await flushPendingResults(dir, down), { sent: 0, kept: 1, dropped: 0 });
    // Back up: delivered and removed.
    const got: string[] = [];
    assert.deepEqual(await flushPendingResults(dir, async (r) => void got.push(r.jobId)), { sent: 1, kept: 0, dropped: 0 });
    assert.deepEqual(got, ["job/7"]);
    assert.equal((await readdir(join(dir, "pending-results"))).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("held containers survive a restart of the agent (state on disk)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-held-"));
  try {
    initHeldContainers(dir);
    holdContainer("app", "paused");
    holdContainer("db", "stopped");
    releaseContainer("app");
    initHeldContainers(dir); // "restart"
    assert.deepEqual(
      heldContainers().map((h) => [h.name, h.action]),
      [["db", "stopped"]],
    );
    releaseContainer("db");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";

test("a container left paused or stopped by a killed agent is resumed at the next start", { skip: !DOCKER, timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-held-"));
  const a = `cbm-heldtest-a-${Date.now()}`;
  const b = `cbm-heldtest-b-${Date.now()}`;
  try {
    for (const n of [a, b]) await docker(["run", "-d", "--name", n, "--network", "none", "alpine:3.24", "sleep", "300"]);
    initHeldContainers(dir);
    await pauseContainer(a); // a backup froze it...
    await stopContainer(b); // ...a restore stopped this one...
    // ...and the agent died here. Next start:
    initHeldContainers(dir);
    assert.equal(heldContainers().length, 2);
    await recoverHeldContainers(() => undefined);
    const state = async (n: string) => (await docker(["inspect", "-f", "{{.State.Status}}", n])).stdout.trim();
    assert.equal(await state(a), "running");
    assert.equal(await state(b), "running");
    assert.equal(heldContainers().length, 0);
  } finally {
    await docker(["rm", "-f", a, b]);
    await rm(dir, { recursive: true, force: true });
  }
});

test("a Redis snapshot restored into a volume is loaded even with AOF on", { skip: !DOCKER, timeout: 300_000 }, async () => {
  const name = `cbm-rdb-${Date.now()}`;
  const vol = `${name}-data`;
  const dir = await mkdtemp(join(tmpdir(), "cbm-rdb-"));
  const cli = (cmd: string) => docker(["exec", name, "sh", "-c", `redis-cli ${cmd}`]);
  try {
    // Coolify's way of running Redis: AOF on.
    assert.equal((await docker(["run", "-d", "--name", name, "-v", `${vol}:/data`, "redis:7.4-alpine", "redis-server", "--appendonly", "yes"])).code, 0);
    await new Promise((r) => setTimeout(r, 2000));
    for (let i = 0; i < 20; i++) await cli(`SET k${i} v${i}`);
    // The real backup path (stdout), then the mark a pre-2.1 snapshot still carries.
    await dumpRedis(name, undefined, join(dir, "s.rdb"));
    await appendFile(join(dir, "s.rdb"), "5c810ec189f8c5f95ec65ce3e117b4a67d2e2c9b");
    await cli("FLUSHALL");
    await docker(["stop", name]);
    await restoreRdbIntoVolume(vol, join(dir, "s.rdb"));
    await docker(["start", name]);
    await new Promise((r) => setTimeout(r, 2000));
    assert.equal((await cli("DBSIZE")).stdout.trim(), "20");
  } finally {
    await docker(["rm", "-f", name]);
    await docker(["volume", "rm", "-f", vol]);
    await rm(dir, { recursive: true, force: true });
  }
});
