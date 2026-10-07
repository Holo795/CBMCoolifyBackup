import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactExcludes, mountExcludeMeta, mountExcludes, nestedFolders } from "../src/excludes.js";
import { staleWarmIds } from "../src/restic.js";

const APP = "/data/coolify/applications/abc";

test("an exclusion naming a whole mount leaves it out, by host path or container path", () => {
  const logs = { hostPath: `${APP}/logs`, destinations: ["/srv/app/var/log"] };
  assert.deepEqual(mountExcludes(logs, [`${APP}/logs`]), { skip: `${APP}/logs`, extra: [] });
  assert.deepEqual(mountExcludes(logs, ["/srv/app/var/log"]), { skip: "/srv/app/var/log", extra: [] });
  // "/logs" keeps its meaning: a folder at the root of each mount.
  assert.deepEqual(mountExcludes(logs, ["/logs"]), { extra: [] });
  // A volume, by where it's mounted.
  assert.deepEqual(mountExcludes({ destinations: ["/var/lib/mysql"] }, ["/var/lib/mysql"]), { skip: "/var/lib/mysql", extra: [] });
});

test("a path inside a mount, written as on the host or in the container, applies to that mount only", () => {
  const data = { hostPath: `${APP}/data`, destinations: ["/data", "/home/ftpdata"] };
  assert.deepEqual(mountExcludes(data, [`${APP}/data/cache`, "/home/ftpdata/tmp", "*.log"]), { extra: ["/cache", "/tmp"] });
  assert.deepEqual(mountExcludes({ hostPath: `${APP}/other`, destinations: ["/x"] }, [`${APP}/data/cache`]), { extra: [] });
});

test("a restore in place keeps the mount's own exclusions too", () => {
  const meta = mountExcludeMeta(["/cache"]);
  assert.deepEqual(artifactExcludes(["/logs"], meta), ["/logs", "/cache"]);
  assert.deepEqual(artifactExcludes(undefined, {}), []);
  assert.deepEqual(artifactExcludes(["/a"], { mountExcludes: "not json" }), ["/a"]);
  assert.deepEqual(mountExcludeMeta([]), {});
});

test("a host folder inside another one is read with it", () => {
  const n = nestedFolders([`${APP}/data`, `${APP}/data/uploads`, `${APP}/logs`, `${APP}/data-old`]);
  assert.deepEqual([...n], [[`${APP}/data/uploads`, `${APP}/data`]]);
});

test("first-pass snapshots are dropped once a day old, never sooner", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const ids = staleWarmIds(
    [
      { id: "old", time: "2026-10-06T10:00:00Z" },
      { id: "recent", time: "2026-10-07T09:00:00Z" },
      { id: "no-time" },
    ],
    now,
  );
  assert.deepEqual(ids, ["old"]);
});
