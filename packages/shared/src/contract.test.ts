import { test } from "node:test";
import assert from "node:assert/strict";
import { Job, SnapshotManifest, excludeError, normalizeExcludes } from "./contract.js";
import { snapshotDir, dumpFileName } from "./naming.js";

test("BackupJob parses a valid payload", () => {
  const job = Job.parse({
    id: "job-1",
    type: "backup",
    mode: "backup",
    liveBackup: false,
    resource: {
      coolifyUuid: "abc",
      name: "events-db",
      type: "postgresql",
      containerName: "postgres-abc",
      containerNames: ["postgres-abc"],
      volumes: ["postgres-data-abc"],
      db: { user: "postgres", password: "x", database: "postgres" },
    },
    destination: { type: "local", basePath: "/backups" },
    encryption: { enabled: false },
    destinationDir: "abc/backups/2026",
  });
  assert.equal(job.type, "backup");
});

test("RestoreJob requires a manifest", () => {
  assert.throws(() =>
    Job.parse({ id: "j", type: "restore", source: { type: "local", basePath: "/b" } }),
  );
});

test("SnapshotManifest applies defaults", () => {
  const m = SnapshotManifest.parse({
    resource: { coolifyUuid: "abc", name: "n", type: "redis" },
    mode: "backup",
    captureMode: "cold",
    capturedAt: "2026-06-23T00:00:00.000Z",
    destinationDir: "abc/backups/x",
  });
  assert.equal(m.version, 1);
  assert.deepEqual(m.artifacts, []);
  assert.equal(m.encrypted, false);
});

test("naming helpers are deterministic", () => {
  assert.equal(
    snapshotDir("inst", "uuid", "sync", "2026-06-23T00:00:00.000Z"),
    "inst/uuid/sync-copies/2026-06-23T00-00-00-000Z",
  );
  // A sync copy is never inside the legacy "<uuid>/sync" folder (deleting a
  // legacy copy must not touch it).
  assert.equal(snapshotDir("inst", "uuid", "sync", "2026-06-23T00:00:00.000Z").startsWith("inst/uuid/sync/"), false);
  assert.equal(
    snapshotDir("inst", "uuid", "backup", "2026-06-23T00:00:00.000Z"),
    "inst/uuid/backups/2026-06-23T00-00-00-000Z",
  );
  assert.equal(dumpFileName("postgresql", "mydb"), "dump-postgresql-mydb.sql");
  assert.equal(dumpFileName("postgresql", undefined), "dump-postgresql-all.sql");
});

test("exclusions may say host: or container:, with an absolute path", () => {
  assert.equal(excludeError("host:/data/coolify/applications/x/logs"), null);
  assert.equal(excludeError("container:/var/log"), null);
  assert.equal(excludeError("host:logs"), "host: needs an absolute path");
  assert.equal(excludeError("container:/a/../b"), "no . or .. segments");
  assert.deepEqual(normalizeExcludes(["host:/a/b/", "container:/c"]), ["host:/a/b", "container:/c"]);
});
