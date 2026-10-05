import { test } from "node:test";
import assert from "node:assert/strict";
import { unsafeRestorePath } from "../src/paths.js";

test("typical Coolify bind folders are allowed", () => {
  for (const ok of [
    "/data/coolify/applications/abc123/storage",
    "/data/coolify/services/xyz/uploads",
    "/home/deploy/app-data",
    "/srv/www/site",
    "/opt/app/config/",
  ]) {
    assert.equal(unsafeRestorePath(ok), null, ok);
  }
});

test("system locations and top-level directories are refused", () => {
  for (const bad of ["/", "/etc", "/etc/nginx", "/usr/local", "/var/lib/docker/volumes/x", "/home", "/root", "/data", "/data/coolify", "/proc/1", "/var/run/docker.sock", "/boot", "//", "/home/"]) {
    assert.ok(unsafeRestorePath(bad), bad);
  }
});

test("paths that could alter the mount or escape are refused", () => {
  assert.ok(unsafeRestorePath("relative/path"));
  assert.ok(unsafeRestorePath("/data/app:/etc"));
  assert.ok(unsafeRestorePath("/data/app/../../etc"));
  assert.ok(unsafeRestorePath("/data/app\n"));
  assert.ok(unsafeRestorePath(""));
});
