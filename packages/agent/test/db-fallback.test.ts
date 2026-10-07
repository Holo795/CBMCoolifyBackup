import { test } from "node:test";
import assert from "node:assert/strict";
import { clientImageFor, toolMissing } from "../src/dump.js";
import { dbFolderOf, dbFolderRun } from "../src/drill.js";

test("the client image matches the server's version when the container says it", () => {
  assert.equal(clientImageFor("mariadb", { MARIADB_VERSION: "1:11.7.2+maria~ubu2404" }), "mariadb:11.7");
  assert.equal(clientImageFor("mysql", { MYSQL_VERSION: "8.4.3-1.el9" }), "mysql:8.4");
  assert.equal(clientImageFor("postgresql", { PG_MAJOR: "15" }), "postgres:15-alpine");
  assert.equal(clientImageFor("postgresql", { PG_MAJOR: "15" }, "16\n"), "postgres:16-alpine"); // the data folder wins
  assert.equal(clientImageFor("mongodb", { MONGO_VERSION: "7.0.14" }), "mongo:7.0");
  // A custom image that says nothing: a recent client that reads older servers.
  assert.equal(clientImageFor("mariadb", {}), "mariadb:11.4");
  assert.equal(clientImageFor("postgresql", {}), "postgres:17-alpine");
});

test("only a missing tool falls back to the official client", () => {
  assert.equal(toolMissing(new Error("docker exec … exited 127: sh: mariadb-dump: not found")), true);
  assert.equal(toolMissing(new Error('OCI runtime exec failed: exec: "pg_dump": executable file not found in $PATH')), true);
  assert.equal(toolMissing(new Error("docker exec … exited 1: ERROR 1045 (28000): Access denied")), false);
  assert.equal(toolMissing(new Error("exited 1270")), false);
});

test("a volume holding a database is started without access control, without network", () => {
  assert.equal(dbFolderOf({ volume: "x" }), null);
  assert.equal(dbFolderOf({ dbEngine: "redis", dbPath: "/data" }), null);
  const maria = dbFolderOf({ dbEngine: "mariadb", dbPath: "/var/lib/mysql", dbImage: "mariadb@sha256:abc" })!;
  assert.deepEqual(dbFolderRun(maria).args, ["mariadb@sha256:abc", "--skip-grant-tables", "--skip-networking"]);
  const pg = dbFolderOf({ dbEngine: "postgresql", dbPath: "/var/lib/postgresql/data", dbUser: "app", dbDataDir: "/var/lib/postgresql/data/pgdata" })!;
  assert.equal(pg.image, "postgres:16-alpine"); // nothing recorded: the engine default
  const run = dbFolderRun(pg);
  assert.deepEqual(run.env, ["-e", "PGDATA=/var/lib/postgresql/data/pgdata"]);
  assert.match(run.args.join(" "), /hba_file=\/tmp\/cbm_hba\.conf -c listen_addresses=''/);
});
