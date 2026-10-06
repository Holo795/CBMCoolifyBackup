import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeExcludes, excludeError } from "@cbm/shared";
import { resticBackupExcludes, resticRestoreExcludes, tarExcludes, wipeScript } from "../src/excludes.js";

test("exclusions are /path from the root or a bare name", () => {
  assert.deepEqual(normalizeExcludes([" /backups/ ", "logs", "", "*.tmp", "logs"]), ["/backups", "logs", "*.tmp"]);
  for (const bad of ["app/logs", "/a/../b", "..", "/", "/x\ny"]) assert.ok(excludeError(bad), bad);
  assert.throws(() => normalizeExcludes(["a/b"]), /Invalid exclusion "a\/b"/);
  assert.throws(() => normalizeExcludes(Array.from({ length: 51 }, (_, i) => `n${i}`)), /At most 50/);
});

test("each tool gets the exclusions its own way", () => {
  const ex = ["/backups", "logs"];
  assert.deepEqual(resticBackupExcludes("/volume/v", ex), ["--exclude", "/volume/v/backups", "--exclude", "logs"]);
  assert.deepEqual(resticRestoreExcludes(ex), ["--exclude", "/backups", "--exclude", "logs"]);
  assert.deepEqual(tarExcludes(ex), ["--exclude", "./backups", "--exclude", "logs"]);
  assert.equal(wipeScript("/data", []), "rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null");
  assert.equal(
    wipeScript("/data", ex),
    "find /data -mindepth 1 -depth \\( -path '/data/backups' -o -path '/data/backups/*' -o -name 'logs' -o -path '*/logs/*' \\) -o -delete 2>/dev/null; true",
  );
  // A quote in a pattern can't break out of the shell word.
  assert.match(wipeScript("/data", ["it's"]), /-name 'it'\\''s'/);
});

/* ------------------- real Docker (CBM_DOCKER_TESTS=1) ------------------- */

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";

test("tar: excluded paths are left out, and kept by a restore", { skip: !DOCKER, timeout: 300_000 }, async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { createWriteStream } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { pipeline } = await import("node:stream/promises");
  const { captureTar } = await import("../src/capture.js");
  const { docker, restoreVolume } = await import("../src/docker.js");
  const id = Math.random().toString(36).slice(2, 8);
  const [src, dst] = [`cbm-ex-src-${id}`, `cbm-ex-dst-${id}`];
  const dir = await mkdtemp(join(tmpdir(), "cbm-ex-"));
  const sh = async (vol: string, script: string) => {
    const r = await docker(["run", "--rm", "-v", `${vol}:/d`, "alpine:3.24", "sh", "-c", script]);
    assert.equal(r.code, 0, r.stderr);
    return r.stdout.trim();
  };
  try {
    await sh(src, "mkdir -p /d/app/logs /d/backups /d/logs && echo a > /d/app/a.txt && echo y > /d/app/logs/y.log && echo d > /d/backups/d.sql && echo l > /d/logs/x.log");
    const file = join(dir, "v.tar");
    await captureTar(src, (body) => pipeline(body, createWriteStream(file)), undefined, ["/backups", "logs"]);
    await sh(dst, "mkdir -p /d/backups /d/app/logs && echo keep > /d/backups/old.sql && echo keep > /d/app/logs/old.log && echo stale > /d/stale.txt");
    await restoreVolume(dst, file, ["/backups", "logs"]);
    assert.equal(await sh(dst, "cd /d && find . -type f | sort | tr '\\n' ' '"), "./app/a.txt ./app/logs/old.log ./backups/old.sql");
  } finally {
    await docker(["volume", "rm", "-f", src, dst]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});
