import { appendFile, open, rm, stat, truncate } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { ResourceType, DbCredentials } from "@cbm/shared";
import { docker, dockerToFile, dockerFromFile, inspectContainer, type SecretEnv } from "./docker.js";

/*
 * Secrets travel in the docker client's ENVIRONMENT (`-e NAME` without a value),
 * never in its arguments - those show up in `ps` and in error messages that end
 * up in job logs and alerts. User and database names (they come from Coolify or
 * a container's environment) are passed to `sh -c` as positional parameters, so
 * a quote in a name can't break out of the script.
 */

/**
 * Where a database command runs: in the database's own container, or - when its
 * image has no client tools - in a throwaway container of the engine's official
 * image (see clientImageFor) that shares the database's network, so 127.0.0.1
 * is the database (CBM_DB_HOST for the MySQL scripts, PGHOST for Postgres), and
 * sees its volumes read-only.
 */
function into(container: string, envArgs: string[], image?: string, interactive = false): string[] {
  const i = interactive ? ["-i"] : [];
  if (!image) return ["exec", ...i, ...envArgs, container];
  return [
    "run",
    "--rm",
    ...i,
    "--network",
    `container:${container}`,
    "--volumes-from",
    `${container}:ro`,
    "-e",
    "CBM_DB_HOST=127.0.0.1",
    "-e",
    "PGHOST=127.0.0.1",
    "--entrypoint",
    "",
    ...envArgs,
    image,
  ];
}

/** mongodump/mongorestore in a throwaway container reach the database over TCP. */
const mongoHost = (image?: string) => (image ? ["--host", "127.0.0.1"] : []);

/** The database refused the login (MySQL / MariaDB 1045, PostgreSQL authentication). */
export function accessDenied(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /ERROR 1045|Access denied for user|password authentication failed|Authentication failed/i.test(m);
}

/** The command failed because the container has no such tool (or no shell). */
export function toolMissing(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /exited 12[67]\b/.test(m) || /executable file not found/.test(m);
}

/**
 * The engine's official image to run its client tools from, the same version as
 * the server where the container says it (images built on the official ones
 * keep its *_VERSION / PG_MAJOR variables; a Postgres data directory names its
 * major version), else a recent one that reads older servers.
 */
export function clientImageFor(type: ResourceType, env: Record<string, string>, pgDataVersion?: string): string {
  const majorMinor = (v?: string) => /(\d+)\.(\d+)/.exec(v?.replace(/^\d+:/, "") ?? "");
  switch (type) {
    case "postgresql": {
      const major = (pgDataVersion?.trim() || env.PG_MAJOR || "").match(/^\d+/)?.[0];
      return `postgres:${major ?? "17"}-alpine`;
    }
    case "mariadb": {
      const v = majorMinor(env.MARIADB_VERSION);
      return v ? `mariadb:${v[1]}.${v[2]}` : "mariadb:11.4";
    }
    case "mysql": {
      const v = majorMinor(env.MYSQL_VERSION);
      return v ? `mysql:${v[1]}.${v[2]}` : "mysql:8.4";
    }
    case "mongodb": {
      const v = majorMinor(env.MONGO_VERSION);
      return v ? `mongo:${v[1]}.${v[2]}` : "mongo:7";
    }
    default:
      throw new Error(`no client image for ${type}`);
  }
}

/** The client image for a database container (see clientImageFor). */
export async function clientImageOf(type: ResourceType, container: string): Promise<string> {
  const info = await inspectContainer(container).catch(() => null);
  const env: Record<string, string> = {};
  for (const e of info?.Config?.Env ?? []) {
    const i = e.indexOf("=");
    if (i > 0) env[e.slice(0, i)] = e.slice(i + 1);
  }
  let pgVersion: string | undefined;
  if (type === "postgresql") {
    const r = await docker(["exec", container, "sh", "-c", 'cat "${PGDATA:-/var/lib/postgresql/data}/PG_VERSION"']).catch(() => null);
    if (r?.code === 0) pgVersion = r.stdout;
  }
  return clientImageFor(type, env, pgVersion);
}

/** `-e NAME` + its value when set; nothing otherwise. */
function secret(name: string, value: string | undefined): { args: string[]; env: SecretEnv } {
  return value ? { args: ["-e", name], env: { [name]: value } } : { args: [], env: {} };
}

/*
 * Every database of the server is dumped, not just the one Coolify created: a
 * second database added later (a common setup) used to be silently left out.
 * System schemas (users, grants) are not: restoring them would replace the
 * target's own root credentials.
 */

// MySQL/MariaDB: every user database, in one consistent transaction. Prefer the
// given tools, fall back to the classic ones. $1 = dump tool, $2 = client, $3 = user.
const MYSQL_DUMP_SCRIPT =
  't="$1"; c="$2"; u="$3"; ' +
  'command -v "$t" >/dev/null 2>&1 || t=mysqldump; command -v "$c" >/dev/null 2>&1 || c=mysql; ' +
  // No client tools at all: 127, like a missing command (see toolMissing).
  'command -v "$t" >/dev/null 2>&1 && command -v "$c" >/dev/null 2>&1 || { echo "$t: not found" >&2; exit 127; }; ' +
  'dbs=$("$c" -u"$u" ${CBM_DB_HOST:+-h"$CBM_DB_HOST"} -N -B -e "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ' +
  "('mysql','information_schema','performance_schema','sys') ORDER BY schema_name\") || exit 1; " +
  'if [ -z "$dbs" ]; then echo "-- no user databases"; exit 0; fi; ' +
  "IFS='\n'; set -f; " +
  // --no-tablespaces: dumping tablespaces needs the global PROCESS privilege,
  // which an application user doesn't have (and Docker databases don't use).
  'exec "$t" -u"$u" ${CBM_DB_HOST:+-h"$CBM_DB_HOST"} --single-transaction --no-tablespaces --routines --events --triggers --databases $dbs';
// $1 = client, $2 = user.
const MYSQL_LOAD_SCRIPT =
  'c="$1"; u="$2"; if command -v "$c" >/dev/null 2>&1; then exec "$c" -u"$u" ${CBM_DB_HOST:+-h"$CBM_DB_HOST"}; else exec mysql -u"$u" ${CBM_DB_HOST:+-h"$CBM_DB_HOST"}; fi';
// MongoDB: auth only with a user AND a password ($CBM_DB_PASSWORD from the env).
// $1 = tool, $2 = user, $3 = database ("" = all), then the tool's own flags.
const MONGO_SCRIPT =
  't="$1"; u="$2"; d="$3"; shift 3; ' +
  'if [ -n "$u" ] && [ -n "$CBM_DB_PASSWORD" ]; then ' +
  'set -- "$@" --username "$u" --password "$CBM_DB_PASSWORD" --authenticationDatabase admin; fi; ' +
  'if [ -n "$d" ]; then set -- "$@" --db "$d"; fi; ' +
  'exec "$t" "$@"';

// $1 = client, $2 = user: the server's data directory, then the databases the
// user sees, then the folders of that directory (one per database).
const MYSQL_COVERAGE_SCRIPT =
  'c="$1"; u="$2"; command -v "$c" >/dev/null 2>&1 || c=mysql; command -v "$c" >/dev/null 2>&1 || exit 127; ' +
  'd=$("$c" -u"$u" ${CBM_DB_HOST:+-h"$CBM_DB_HOST"} -N -B -e "SELECT @@datadir") || exit 1; ' +
  'echo "-- visible"; "$c" -u"$u" ${CBM_DB_HOST:+-h"$CBM_DB_HOST"} -N -B -e "SELECT schema_name FROM information_schema.schemata" || exit 1; ' +
  'echo "-- folders"; ls -1p "$d"';

/** Folders of a MySQL/MariaDB data directory that aren't databases. */
const NOT_DATABASES = new Set(["mysql", "performance_schema", "sys", "information_schema", "lost+found"]);

/** A data-directory folder name back to its database name (`my@002ddb` -> `my-db`). */
export function decodeMysqlFolder(name: string): string {
  return name.replace(/@([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** From MYSQL_COVERAGE_SCRIPT's output: databases on the server the dump's user can't see. */
export function unseenDatabases(output: string): string[] {
  const visible = new Set<string>();
  const folders: string[] = [];
  let part: "" | "visible" | "folders" = "";
  for (const raw of output.split("\n")) {
    const line = raw.trim();
    if (line === "-- visible" || line === "-- folders") {
      part = line === "-- visible" ? "visible" : "folders";
      continue;
    }
    if (!line) continue;
    if (part === "visible") visible.add(line);
    // `ls -p`: folders end with "/", files (logs, ibdata...) don't.
    else if (part === "folders" && line.endsWith("/") && !line.startsWith("#") && !line.startsWith("."))
      folders.push(decodeMysqlFolder(line.slice(0, -1)));
  }
  return folders.filter((f) => !NOT_DATABASES.has(f) && !visible.has(f)).sort();
}

/**
 * Databases of a MySQL/MariaDB server that a dump as `db.user` leaves out: an
 * application user only sees its own. Those are then only in the copy of the
 * volume. [] when nothing is missing or it can't tell.
 */
export async function mysqlUnseenDatabases(type: ResourceType, container: string, db: DbCredentials, image?: string): Promise<string[]> {
  const s = secret("MYSQL_PWD", db.password ?? "");
  const client = type === "mariadb" ? "mariadb" : "mysql";
  const r = await docker([...into(container, s.args, image), "sh", "-c", MYSQL_COVERAGE_SCRIPT, "sh", client, db.user || "root"], s.env).catch(() => null);
  return r?.code === 0 ? unseenDatabases(r.stdout) : [];
}

/** Produce a logical dump of a database container into outFile (`image`: run
 * the client from that image instead, see `into`). */
export async function dumpDatabase(
  type: ResourceType,
  container: string,
  db: DbCredentials,
  outFile: string,
  image?: string,
): Promise<void> {
  const user = db.user ?? "";
  const password = db.password ?? "";
  const database = db.database ?? "";

  switch (type) {
    case "postgresql": {
      await dumpPostgres(container, user || "postgres", password, database, outFile, image);
      return;
    }
    case "mysql":
    case "mariadb": {
      const s = secret("MYSQL_PWD", password);
      const [tool, client] = type === "mariadb" ? ["mariadb-dump", "mariadb"] : ["mysqldump", "mysql"];
      await dockerToFile(
        [...into(container, s.args, image), "sh", "-c", MYSQL_DUMP_SCRIPT, "sh", tool, client, user || "root"],
        outFile,
        s.env,
      );
      return;
    }
    case "mongodb": {
      // No --db: every database (mongodump always leaves out "local").
      const s = secret("CBM_DB_PASSWORD", user ? password : "");
      await dockerToFile(
        [...into(container, s.args, image), "sh", "-c", MONGO_SCRIPT, "sh", "mongodump", user, "", "--archive", ...mongoHost(image)],
        outFile,
        s.env,
      );
      return;
    }
    default:
      throw new Error(`No logical dump supported for type ${type}`);
  }
}

const sqlLiteral = (v: string) => `'${v.replace(/'/g, "''")}'`;
const psqlIdent = (v: string) => `"${v.replace(/"/g, '""')}"`;

/**
 * Header that makes psql create (if missing) and switch to one more database,
 * the way pg_dumpall chains databases in one script.
 */
export function pgDatabaseHeader(name: string): string {
  return (
    `\n-- CBM: database ${psqlIdent(name)}\n` +
    `SELECT 'CREATE DATABASE ' || quote_ident(${sqlLiteral(name)}) ` +
    `WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = ${sqlLiteral(name)})\\gexec\n` +
    `\\connect ${psqlIdent(name)}\n`
  );
}

/**
 * PostgreSQL: the configured database first, exactly as before (a restore loads
 * it into the target's configured database), then every other database, each
 * behind a header that creates and connects to it.
 */
async function dumpPostgres(
  container: string,
  user: string,
  password: string,
  database: string,
  outFile: string,
  image?: string,
): Promise<void> {
  const s = secret("PGPASSWORD", password);
  const primary = database || user; // psql/pg_dump's own default
  const pgDump = (db: string) => [...into(container, s.args, image), "pg_dump", "-U", user, "--clean", "--if-exists", "--no-owner", "-d", db];

  await dockerToFile(pgDump(primary), outFile, s.env);

  const list = await docker(
    [
      ...into(container, s.args, image),
      "psql",
      "-U",
      user,
      "-d",
      primary,
      "-AtXc",
      "SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn ORDER BY datname",
    ],
    s.env,
  );
  if (list.code !== 0) throw new Error(`could not list the databases: ${list.stderr.trim().slice(0, 300)}`);
  const others = list.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((d) => d && d !== primary);

  for (const db of others) {
    const part = `${outFile}.db`;
    try {
      await dockerToFile(pgDump(db), part, s.env);
      await appendFile(outFile, pgDatabaseHeader(db));
      await pipeline(createReadStream(part), createWriteStream(outFile, { flags: "a" }));
    } finally {
      await rm(part, { force: true });
    }
  }
}

/**
 * Stream a consistent RDB snapshot of a Redis-family store (redis/keydb/
 * dragonfly) to outFile via the in-container CLI - no freeze, no disk write on
 * the server. Throws if no compatible CLI is present (caller falls back to a
 * volume copy). Auth goes through REDISCLI_AUTH in the environment, so the
 * password never lands in any process arguments.
 */
export async function dumpRedis(container: string, password: string | undefined, outFile: string): Promise<void> {
  const s = secret("REDISCLI_AUTH", password);
  await dockerToFile(
    [
      "exec",
      ...s.args,
      container,
      "sh",
      "-c",
      "(command -v redis-cli >/dev/null 2>&1 && redis-cli --no-auth-warning --rdb -) || " +
        "(command -v keydb-cli >/dev/null 2>&1 && keydb-cli --no-auth-warning --rdb -)",
    ],
    outFile,
    s.env,
  );
  // `redis-cli --rdb -` can exit 0 while streaming a truncated/empty payload on
  // some error paths. Validate the RDB magic so a useless dump can't be treated
  // as success (the caller then falls back to a frozen volume copy).
  if ((await stat(outFile)).size < 9) throw new Error("Redis RDB export is empty");
  await stripRdbEofMark(outFile);
  const fh = await open(outFile, "r");
  try {
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    if (buf.toString("latin1") !== "REDIS") throw new Error("Redis RDB export has an invalid header");
  } finally {
    await fh.close();
  }
}

/**
 * `redis-cli --rdb -` can't truncate stdout, so when the server streams the RDB
 * with a diskless-replication EOF mark the 40-character mark stays after the
 * RDB's own end (0xFF + 8-byte checksum). Loading dump.rdb tolerates it; loading
 * it as an AOF base (Coolify's Redis runs with AOF) refuses the file. Returns
 * whether a mark was removed.
 */
export async function stripRdbEofMark(file: string): Promise<boolean> {
  const MARK = 40;
  const size = (await stat(file)).size;
  if (size < 9 + MARK + 9) return false;
  const fh = await open(file, "r");
  const tail = Buffer.alloc(9 + MARK);
  try {
    await fh.read(tail, 0, tail.length, size - tail.length);
  } finally {
    await fh.close();
  }
  const cleanEnd = (await readByte(file, size - 9)) === 0xff;
  const markEnd = tail[0] === 0xff && /^[0-9a-f]{40}$/i.test(tail.subarray(9).toString("latin1"));
  if (cleanEnd || !markEnd) return false;
  await truncate(file, size - MARK);
  return true;
}

async function readByte(file: string, pos: number): Promise<number> {
  const fh = await open(file, "r");
  try {
    const b = Buffer.alloc(1);
    await fh.read(b, 0, 1, pos);
    return b[0];
  } finally {
    await fh.close();
  }
}

/** Restore a logical dump into a running database container (`image`: run the
 * client from that image instead, see `into`). */
export async function restoreDatabase(
  type: ResourceType,
  container: string,
  db: DbCredentials,
  inFile: string,
  image?: string,
): Promise<void> {
  const user = db.user ?? "";
  const password = db.password ?? "";
  const database = db.database ?? "";

  switch (type) {
    case "postgresql": {
      const s = secret("PGPASSWORD", password);
      const args = [...into(container, s.args, image, true), "psql", "-U", user || "postgres"];
      if (database) args.push("-d", database);
      await dockerFromFile(args, inFile, s.env);
      return;
    }
    case "mysql":
    case "mariadb": {
      const s = secret("MYSQL_PWD", password);
      const client = type === "mariadb" ? "mariadb" : "mysql";
      await dockerFromFile(
        [...into(container, s.args, image, true), "sh", "-c", MYSQL_LOAD_SCRIPT, "sh", client, user || "root"],
        inFile,
        s.env,
      );
      return;
    }
    case "mongodb": {
      const s = secret("CBM_DB_PASSWORD", user ? password : "");
      // No --db: the archive carries its databases; --drop replaces them. Never
      // admin/config: their users would replace the target's own credentials.
      await dockerFromFile(
        [
          ...into(container, s.args, image, true),
          "sh",
          "-c",
          MONGO_SCRIPT,
          "sh",
          "mongorestore",
          user,
          "",
          "--archive",
          "--drop",
          "--nsExclude=admin.*",
          "--nsExclude=config.*",
          ...mongoHost(image),
        ],
        inFile,
        s.env,
      );
      return;
    }
    default:
      throw new Error(`No logical restore supported for type ${type}`);
  }
}

/**
 * A dump, with the client of the engine's official image when the database's
 * own image has none (see `into`). Returns that image when it was used.
 */
export async function dumpDatabaseAnyway(
  type: ResourceType,
  container: string,
  db: DbCredentials,
  outFile: string,
): Promise<string | undefined> {
  try {
    await dumpDatabase(type, container, db, outFile);
    return undefined;
  } catch (e) {
    if (!toolMissing(e)) throw e;
    const image = await clientImageOf(type, container);
    await dumpDatabase(type, container, db, outFile, image);
    return image;
  }
}

/** A restore, with the official client when the database's image has none. */
export async function restoreDatabaseAnyway(
  type: ResourceType,
  container: string,
  db: DbCredentials,
  inFile: string,
): Promise<string | undefined> {
  try {
    await restoreDatabase(type, container, db, inFile);
    return undefined;
  } catch (e) {
    if (!toolMissing(e)) throw e;
    const image = await clientImageOf(type, container);
    await restoreDatabase(type, container, db, inFile, image);
    return image;
  }
}
