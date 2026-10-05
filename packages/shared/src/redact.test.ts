import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "./redact.js";

test("masks KEY=value for secret-like variable names", () => {
  assert.equal(
    redactSecrets("docker exec -e PGPASSWORD=s3cr3t db pg_dump"),
    "docker exec -e PGPASSWORD=*** db pg_dump",
  );
  assert.equal(redactSecrets("MYSQL_PWD='a b' x"), "MYSQL_PWD=*** x");
  assert.equal(redactSecrets("REDISCLI_AUTH=xyz"), "REDISCLI_AUTH=***");
  assert.equal(redactSecrets("AWS_SECRET_ACCESS_KEY=abc"), "AWS_SECRET_ACCESS_KEY=***");
});

test("masks --password style flags and mysql -p", () => {
  assert.equal(
    redactSecrets("mongodump --username='app' --password='p@ss' --archive"),
    "mongodump --username='app' --password=*** --archive",
  );
  assert.equal(redactSecrets("tool --password hunter2 --x"), "tool --password *** --x");
  assert.equal(redactSecrets("mysql -uroot -p'pw' db"), "mysql -uroot -p*** db");
});

test("masks the password in connection URLs", () => {
  assert.equal(
    redactSecrets("postgres://app:pw123@db:5432/app failed"),
    "postgres://app:***@db:5432/app failed",
  );
});

test("leaves ordinary text alone", () => {
  const s = "pg_dump: error: connection to server on socket failed: No such file or directory (port -P 5432)";
  assert.equal(redactSecrets(s), s);
  assert.equal(redactSecrets("docker exec -i db psql -U app -d app"), "docker exec -i db psql -U app -d app");
});
