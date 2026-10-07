import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactExcludes, classifyExcludes, excludesMeta, mountExcludes, nestedFolders } from "../src/excludes.js";
import { staleWarmIds } from "../src/restic.js";

const APP = "/data/coolify/applications/abc";

const LOGS = { hostPath: `${APP}/logs`, destinations: ["/srv/app/var/log"] };
const DATA = { hostPath: `${APP}/data`, destinations: ["/data", "/home/ftpdata"] };
const SQL = { hostPath: `${APP}/backups/sql`, destinations: ["/backups"] };
const DB = { destinations: ["/var/lib/mysql"] };
const MOUNTS = [LOGS, DATA, SQL, DB];
const effective = (mount: typeof DATA | typeof DB, excludes: string[]) => mountExcludes(mount, classifyExcludes(excludes, MOUNTS));

test("an exclusion naming a whole mount leaves it out, by host path or container path", () => {
  assert.deepEqual(effective(LOGS, [`${APP}/logs`]), { skip: `host path ${APP}/logs`, excludes: [] });
  assert.deepEqual(effective(LOGS, ["/srv/app/var/log"]), { skip: "container path /srv/app/var/log", excludes: [] });
  // "/logs" keeps its meaning: a folder at the root of each mount.
  assert.deepEqual(effective(LOGS, ["/logs"]), { excludes: ["/logs"] });
  assert.deepEqual(effective(DB, ["/var/lib/mysql"]), { skip: "container path /var/lib/mysql", excludes: [] });
});

test("a host path is never read as a path in a container that mounts something at /data", () => {
  // The host folders live under /data/coolify/..., and a container mounts the data folder at /data.
  const ex = [`${APP}/logs`, `${APP}/backups/sql`];
  assert.deepEqual(effective(DATA, ex), { excludes: [] });
  // And a root-relative pattern isn't applied for them either.
  assert.deepEqual(classifyExcludes(ex, MOUNTS).map((c) => c.kind), ["host", "host"]);
});

test("a path inside a mount applies to that mount only, as host path or container path", () => {
  assert.deepEqual(effective(DATA, [`${APP}/data/cache`, "/home/ftpdata/tmp", "*.log"]), { excludes: ["/cache", "/tmp", "*.log"] });
  assert.deepEqual(effective(LOGS, [`${APP}/data/cache`]), { excludes: [] });
});

test("host: and container: say which kind of path it is", () => {
  assert.deepEqual(classifyExcludes(["host:/data/x", "container:/data/x", "/data/x"], MOUNTS), [
    { kind: "host", path: "/data/x" },
    { kind: "container", path: "/data/x" },
    { kind: "container", path: "/data/x" },
  ]);
  // container:/data/x inside the data folder mounted at /data; host:/data/x matches no host folder.
  assert.deepEqual(effective(DATA, ["container:/data/x"]), { excludes: ["/x"] });
  assert.deepEqual(effective(DATA, ["host:/data/x"]), { excludes: [] });
});

test("a restore in place leaves exactly what the backup left out", () => {
  assert.deepEqual(artifactExcludes(["/logs", "/data/coolify/x"], excludesMeta(["/logs", "/cache"])), ["/logs", "/cache"]);
  // Before 2.4.7: the resource's list plus the mount's extras.
  assert.deepEqual(artifactExcludes(["/logs", "host:/a"], { mountExcludes: JSON.stringify(["/cache"]) }), ["/logs", "/cache"]);
  assert.deepEqual(artifactExcludes(undefined, {}), []);
  assert.deepEqual(artifactExcludes(["/a"], { excludes: "not json" }), ["/a"]);
  assert.deepEqual(excludesMeta([]), {});
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
