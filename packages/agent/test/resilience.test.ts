import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobResult } from "@cbm/shared";
import { deliverResult, flushPendingResults } from "../src/outbox.js";
import { initHeldContainers, holdContainer, releaseContainer, heldContainers } from "../src/held.js";
import { docker, pauseContainer, stopContainer, recoverHeldContainers } from "../src/docker.js";

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
    for (const n of [a, b]) await docker(["run", "-d", "--name", n, "--network", "none", "alpine:3.20", "sleep", "300"]);
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
