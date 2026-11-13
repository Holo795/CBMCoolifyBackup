import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResourceType, DbCredentials } from "@cbm/shared";
import { dumpDatabase, restoreDatabase, pgLoadErrors } from "../src/dump.js";
import { docker } from "../src/docker.js";

/*
 * Real round trips for every dump engine (opt-in: CBM_DOCKER_TESTS=1). The
 * password deliberately contains quotes, `$` and spaces: secrets travel through
 * docker's environment and names through positional parameters, so nothing in
 * the shell scripts may break on them.
 */
const DOCKER = process.env.CBM_DOCKER_TESTS === "1";
const PW = `p'w"$x y\\z`;
// The official mysql image's own init script builds SQL from the root password
// without escaping it (a ' or a \\ breaks its first boot), so MySQL gets a
// password with only the characters that image can take. CBM never interprets
// the password either way: it only travels through docker's environment.
const PW_MYSQL = `pw"$x y`;


type Engine = {
  type: ResourceType;
  image: string;
  env: Record<string, string>;
  creds: DbCredentials;
  ready: string;
  seed: string;
  check: string;
  expect: RegExp;
  /** A second database the dump must carry too (not just the configured one). */
  seedExtra: string;
  checkExtra: string;
};

const ENGINES: Engine[] = [
  {
    type: "postgresql",
    image: "postgres:16-alpine",
    env: { POSTGRES_USER: "app", POSTGRES_PASSWORD: PW, POSTGRES_DB: "shop" },
    creds: { user: "app", password: PW, database: "shop" },
    ready: 'psql -U app -d shop -tAc "select 1"',
    seed: `psql -U app -d shop -c "create table t (v text); insert into t values ('it''s ok')"`,
    check: 'psql -U app -d shop -tAc "select v from t"',
    expect: /it's ok/,
    seedExtra: `psql -U app -d shop -c 'create database "extra db"' && psql -U app -d "extra db" -c "create table e (v text); insert into e values ('extra-ok')"`,
    checkExtra: `psql -U app -d "extra db" -tAc "select v from e"`,
  },
  {
    type: "mysql",
    image: "mysql:8.4",
    env: { MYSQL_ROOT_PASSWORD: PW_MYSQL, MYSQL_DATABASE: "shop" },
    creds: { user: "root", password: PW_MYSQL, database: "shop" },
    ready: 'MYSQL_PWD="$PW" mysql -uroot -e "select 1"',
    seed: `MYSQL_PWD="$PW" mysql -uroot shop -e "create table t (v text); insert into t values ('it''s ok')"`,
    check: 'MYSQL_PWD="$PW" mysql -uroot -N shop -e "select v from t"',
    expect: /it's ok/,
    seedExtra: `MYSQL_PWD="$PW" mysql -uroot -e "create database extra; create table extra.e (v text); insert into extra.e values ('extra-ok')"`,
    checkExtra: 'MYSQL_PWD="$PW" mysql -uroot -N -e "select v from extra.e"',
  },
  {
    type: "mariadb",
    image: "mariadb:11",
    env: { MARIADB_ROOT_PASSWORD: PW, MARIADB_DATABASE: "shop" },
    creds: { user: "root", password: PW, database: "shop" },
    ready: 'MYSQL_PWD="$PW" mariadb -uroot -e "select 1"',
    seed: `MYSQL_PWD="$PW" mariadb -uroot shop -e "create table t (v text); insert into t values ('it''s ok')"`,
    check: 'MYSQL_PWD="$PW" mariadb -uroot -N shop -e "select v from t"',
    expect: /it's ok/,
    seedExtra: `MYSQL_PWD="$PW" mariadb -uroot -e "create database extra; create table extra.e (v text); insert into extra.e values ('extra-ok')"`,
    checkExtra: 'MYSQL_PWD="$PW" mariadb -uroot -N -e "select v from extra.e"',
  },
  {
    type: "mongodb",
    image: "mongo:7",
    env: { MONGO_INITDB_ROOT_USERNAME: "root", MONGO_INITDB_ROOT_PASSWORD: PW },
    creds: { user: "root", password: PW, database: "shop" },
    ready: 'mongosh --quiet -u root -p "$PW" --authenticationDatabase admin --eval "db.adminCommand({ping:1}).ok"',
    seed: `mongosh --quiet -u root -p "$PW" --authenticationDatabase admin shop --eval 'db.t.insertOne({v:"it\\u0027s ok"})'`,
    check: `mongosh --quiet -u root -p "$PW" --authenticationDatabase admin shop --eval 'print(db.t.findOne().v)'`,
    expect: /it's ok/,
    seedExtra: `mongosh --quiet -u root -p "$PW" --authenticationDatabase admin extra --eval 'db.e.insertOne({v:"extra-ok"})'`,
    checkExtra: `mongosh --quiet -u root -p "$PW" --authenticationDatabase admin extra --eval 'print(db.e.findOne().v)'`,
  },
];

const sh = (name: string, script: string, pw = PW) => docker(["exec", "-e", "PW", name, "sh", "-c", script], { PW: pw });

async function start(e: Engine, name: string) {
  const envArgs = Object.keys(e.env).flatMap((k) => ["-e", k]);
  const r = await docker(["run", "-d", "--name", name, "--network", "none", ...envArgs, e.image], e.env);
  assert.equal(r.code, 0, r.stderr);
  let streak = 0;
  for (let i = 0; i < 120 && streak < 3; i++) {
    streak = (await sh(name, e.ready, e.creds.password)).code === 0 ? streak + 1 : 0;
    await new Promise((res) => setTimeout(res, 2000));
  }
  assert.equal(streak >= 3, true, `${e.type} never became ready`);
}

for (const e of ENGINES) {
  test(`${e.type}: dump and restore round trip with a hostile password`, { skip: !DOCKER, timeout: 600_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "cbm-dump-"));
    const src = `cbm-dumptest-src-${e.type}-${Date.now()}`;
    const dst = `cbm-dumptest-dst-${e.type}-${Date.now()}`;
    try {
      await start(e, src);
      const seeded = await sh(src, e.seed, e.creds.password);
      assert.equal(seeded.code, 0, seeded.stderr);
      const extra = await sh(src, e.seedExtra, e.creds.password);
      assert.equal(extra.code, 0, extra.stderr);
      const file = join(dir, "dump");
      await dumpDatabase(e.type, src, e.creds, file);

      await start(e, dst);
      await restoreDatabase(e.type, dst, e.creds, file);
      const got = await sh(dst, e.check, e.creds.password);
      assert.equal(got.code, 0, got.stderr);
      assert.match(got.stdout, e.expect);
      const gotExtra = await sh(dst, e.checkExtra, e.creds.password);
      assert.equal(gotExtra.code, 0, gotExtra.stderr);
      assert.match(gotExtra.stdout, /extra-ok/);
    } finally {
      await docker(["rm", "-f", "-v", src, dst]);
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("a failed dump never puts the password in its error message", { skip: !DOCKER, timeout: 600_000 }, async () => {
  const e = ENGINES[1]; // mysql always checks the password
  const name = `cbm-dumptest-leak-${Date.now()}`;
  const dir = await mkdtemp(join(tmpdir(), "cbm-dump-"));
  const wrong = "WrongPass#123-secret";
  try {
    await start(e, name);
    await assert.rejects(
      () => dumpDatabase("mysql", name, { user: "root", password: wrong, database: "shop" }, join(dir, "x")),
      (err: Error) => {
        assert.doesNotMatch(err.message, /WrongPass#123-secret/);
        assert.match(err.message, /exited/);
        return true;
      },
    );
  } finally {
    await docker(["rm", "-f", "-v", name]);
    await rm(dir, { recursive: true, force: true });
  }
});

test("a PostgreSQL load fails on its errors, except a privilege for a role that isn't there", () => {
  const stderr = [
    'ERROR:  role "reader" does not exist',
    'ERROR:  invalid input syntax for type numeric: "not-a-number"',
    "CONTEXT:  COPY orders, line 2, column total: \"not-a-number\"",
    'psql:<stdin>:40: ERROR:  extension "postgis" is not available',
    "NOTICE:  table \"x\" does not exist, skipping",
  ].join("\n");
  const { fatal, ignored } = pgLoadErrors(stderr);
  assert.deepEqual(ignored, ['role "reader" does not exist']);
  assert.deepEqual(fatal, ['invalid input syntax for type numeric: "not-a-number"', 'extension "postgis" is not available']);
  assert.deepEqual(pgLoadErrors(""), { fatal: [], ignored: [] });
});

test("postgresql: a dump whose data is refused fails the restore; one in place and one with a missing role don't", { skip: !DOCKER, timeout: 600_000 }, async () => {
  const e = ENGINES[0];
  const dir = await mkdtemp(join(tmpdir(), "cbm-dump-"));
  const name = `cbm-dumptest-pgload-${Date.now()}`;
  const other = `cbm-dumptest-pgload2-${Date.now()}`;
  try {
    await start(e, name);
    const seeded = await sh(
      name,
      `psql -U app -d shop -c "create table orders (id int primary key, total numeric); insert into orders select g, g from generate_series(1,500) g; create role reader; grant select on orders to reader"`,
      e.creds.password,
    );
    assert.equal(seeded.code, 0, seeded.stderr);
    const file = join(dir, "dump");
    await dumpDatabase(e.type, name, e.creds, file);

    // In place: the dump drops and recreates what it holds, without an error.
    await restoreDatabase(e.type, name, e.creds, file);
    const count = (db: string) => sh(db, `psql -U app -d shop -tAc "select count(*) from orders"`, e.creds.password);
    assert.equal((await count(name)).stdout.trim(), "500");

    // Elsewhere, without the role its privilege names: loaded, the privilege skipped.
    await start(e, other);
    await restoreDatabase(e.type, other, e.creds, file);
    assert.equal((await count(other)).stdout.trim(), "500");

    // Data the target refuses: psql exits 0, the restore must not.
    const bad = join(dir, "bad.sql");
    await writeFile(
      bad,
      "DROP TABLE IF EXISTS orders;\nCREATE TABLE orders (id int primary key, total numeric);\nCOPY public.orders (id, total) FROM stdin;\n1\t10\n2\tnot-a-number\n\\.\n",
    );
    await assert.rejects(restoreDatabase(e.type, other, e.creds, bad), /did not load completely.*not-a-number/);
  } finally {
    await docker(["rm", "-f", "-v", name, other]);
    await rm(dir, { recursive: true, force: true });
  }
});
