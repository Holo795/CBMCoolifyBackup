import { test } from "node:test";
import assert from "node:assert/strict";
import { mysqlCredentials } from "../src/resolve.js";

test("MariaDB with a random root password is dumped as its application user", () => {
  const env = { MARIADB_RANDOM_ROOT_PASSWORD: "yes", MARIADB_USER: "app", MARIADB_PASSWORD: "pw", MARIADB_DATABASE: "shop" };
  assert.deepEqual(mysqlCredentials(env, "mariadb"), { user: "app", password: "pw", database: "shop" });
});

test("a known root password wins, MySQL_* names work for MariaDB too", () => {
  assert.deepEqual(mysqlCredentials({ MARIADB_ROOT_PASSWORD: "r", MARIADB_USER: "app", MARIADB_PASSWORD: "pw" }, "mariadb"), {
    user: "root",
    password: "r",
    database: "",
  });
  assert.deepEqual(mysqlCredentials({ MYSQL_ROOT_PASSWORD: "r", MYSQL_DATABASE: "d" }, "mariadb"), { user: "root", password: "r", database: "d" });
});

test("MySQL: never the application user's password for root", () => {
  const env = { MYSQL_RANDOM_ROOT_PASSWORD: "1", MYSQL_USER: "app", MYSQL_PASSWORD: "pw", MYSQL_DATABASE: "d" };
  assert.deepEqual(mysqlCredentials(env, "mysql"), { user: "app", password: "pw", database: "d" });
  // MARIADB_* names aren't read for a MySQL image.
  assert.deepEqual(mysqlCredentials({ MARIADB_USER: "x", MARIADB_PASSWORD: "y" }, "mysql"), { user: "root", password: "", database: "" });
  // Empty root password allowed: root without one.
  assert.deepEqual(mysqlCredentials({ MYSQL_ALLOW_EMPTY_PASSWORD: "yes" }, "mysql"), { user: "root", password: "", database: "" });
});

test("a non-root dump says which databases it leaves out", async () => {
  const { unseenDatabases, decodeMysqlFolder } = await import("../src/dump.js");
  assert.equal(decodeMysqlFolder("my@002ddb"), "my-db");
  const out = ["-- visible", "information_schema", "shop", "-- folders", "#innodb_redo/", "ibdata1", "mysql/", "performance_schema/", "shop/", "sys/", "billing/", "my@002ddb/", "lost+found/", "tc.log"].join("\n");
  assert.deepEqual(unseenDatabases(out), ["billing", "my-db"]);
  assert.deepEqual(unseenDatabases("-- visible\nshop\n-- folders\nshop/\nmysql/\n"), []);
});

test("the login set in CBM replaces the environment's user and password, not the database", async () => {
  const { withDumpCredentials } = await import("@cbm/shared");
  assert.deepEqual(withDumpCredentials({ user: "app", password: "x", database: "shop" }, { user: "backup", password: "y" }), {
    user: "backup",
    password: "y",
    database: "shop",
  });
  assert.deepEqual(withDumpCredentials({ user: "app" }, undefined), { user: "app" });
  assert.deepEqual(withDumpCredentials(undefined, { user: "root", password: "" }), { user: "root", password: "" });
});

test("every login the environment offers is tried, root first, then the application user", async () => {
  const { mysqlLogins, uniqueLogins } = await import("../src/resolve.js");
  assert.deepEqual(mysqlLogins({ MYSQL_ROOT_PASSWORD: "r", MYSQL_USER: "app", MYSQL_PASSWORD: "p", MYSQL_DATABASE: "d" }, "mysql"), [
    { user: "root", password: "r", database: "d" },
    { user: "app", password: "p", database: "d" },
  ]);
  assert.deepEqual(mysqlLogins({}, "mariadb"), [{ user: "root", password: "", database: "" }]);
  // Coolify's credentials and the environment's, when they're the same, are tried once.
  assert.deepEqual(uniqueLogins([{ user: "root", password: "r" }, { user: "root", password: "r", database: "d" }, { user: "app", password: "p" }]), [
    { user: "root", password: "r" },
    { user: "app", password: "p" },
  ]);
});

test("only a refused login moves on to the next one", async () => {
  const { accessDenied } = await import("../src/dump.js");
  assert.equal(accessDenied(new Error("exited 1: ERROR 1045 (28000): Access denied for user 'root'@'localhost'")), true);
  assert.equal(accessDenied(new Error('pg_dump: error: FATAL:  password authentication failed for user "x"')), true);
  assert.equal(accessDenied(new Error("ERROR 2002: Can't connect to local server")), false);
});
