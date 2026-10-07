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
