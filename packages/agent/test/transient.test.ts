import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTransientFailure } from "../src/outcome.js";
import { backupWithRetry } from "../src/runner.js";
import { hostEntries, setHelperImage, helperImage } from "../src/docker.js";

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";

test("transient failures: Docker, DNS, network, a locked repository", () => {
  assert.ok(
    isTransientFailure(
      'Could not look into /data/coolify/source on the host (docker exited 125): docker: Error response from daemon: Head "https://registry-1.docker.io/v2/library/alpine/manifests/3.24": dial tcp: lookup auth.docker.io on 213.0.0.1:53: server misbehaving',
    ),
  );
  assert.ok(isTransientFailure("fetch failed (EAI_AGAIN)"));
  assert.ok(isTransientFailure("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?"));
  assert.ok(isTransientFailure("Error response from daemon: removal of container abc is already in progress"));
  assert.ok(isTransientFailure("upload failed: 503 Service Unavailable"));
  assert.ok(isTransientFailure("unable to create lock in backend: repository is already locked by PID 12"));
  // About the resource or the destination: no retry.
  assert.ok(!isTransientFailure("mysqldump: Got error: 1045: Access denied for user 'root'@'localhost'"));
  assert.ok(!isTransientFailure("Disk full on the agent host"));
  assert.ok(!isTransientFailure("No such container: app-1"));
});

test("a backup is tried once more after a transient failure, not after another one", async () => {
  const events: string[] = [];
  const emit = (_level: string, message: string) => void events.push(message);
  let calls = 0;
  const flaky = () => {
    calls++;
    return calls === 1 ? Promise.reject(new Error("lookup auth.docker.io: server misbehaving")) : Promise.resolve("ok");
  };
  assert.equal(await backupWithRetry(flaky, emit, 0), "ok");
  assert.equal(calls, 2);
  assert.match(events[0], /passing reason .*server misbehaving.*trying again/);

  calls = 0;
  const broken = () => {
    calls++;
    return Promise.reject(new Error("Access denied (1045)"));
  };
  await assert.rejects(backupWithRetry(broken, emit, 0), /Access denied/);
  assert.equal(calls, 1);

  const down = () => Promise.reject(new Error("Cannot connect to the Docker daemon"));
  await assert.rejects(backupWithRetry(down, emit, 0), /Cannot connect to the Docker daemon \(failed again 0 s later\)/);
});

test("hostEntries: absent folder, present entries, and a check that can't run", { skip: !DOCKER, timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-entries-"));
  try {
    await writeFile(join(dir, ".env"), "X=1\n");
    assert.deepEqual(await hostEntries(dir, [".env", "nope"], "-f"), [".env"]);
    // A folder that doesn't exist on the host: nothing there, not an error.
    assert.deepEqual(await hostEntries(join(dir, "missing"), [".env"], "-f"), []);
    // The helper can't start (here: an image that doesn't exist): an error, not "nothing there".
    const before = helperImage();
    setHelperImage("cbm-no-such-image-for-tests:0");
    try {
      await assert.rejects(hostEntries(dir, [".env"], "-f", [10]), /Could not look into .* on the host/);
    } finally {
      setHelperImage(before);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
