import { open, stat } from "node:fs/promises";
import type { ResourceType, DbCredentials } from "@cbm/shared";
import { dockerToFile, dockerFromFile, type SecretEnv } from "./docker.js";

/*
 * Secrets travel in the docker client's ENVIRONMENT (`-e NAME` without a value),
 * never in its arguments - those show up in `ps` and in error messages that end
 * up in job logs and alerts. User and database names (they come from Coolify or
 * a container's environment) are passed to `sh -c` as positional parameters, so
 * a quote in a name can't break out of the script.
 */

/** `-e NAME` + its value when set; nothing otherwise. */
function secret(name: string, value: string | undefined): { args: string[]; env: SecretEnv } {
  return value ? { args: ["-e", name], env: { [name]: value } } : { args: [], env: {} };
}

// MySQL/MariaDB: prefer the given client tool, fall back to the classic one.
// $1 = tool, $2 = user, $3 = database ("" = all).
const MYSQL_DUMP_SCRIPT =
  't="$1"; u="$2"; d="$3"; ' +
  'if [ -n "$d" ]; then set -- --databases "$d"; else set -- --all-databases; fi; ' +
  'if command -v "$t" >/dev/null 2>&1; then exec "$t" -u"$u" "$@"; else exec mysqldump -u"$u" "$@"; fi';
// $1 = client, $2 = user.
const MYSQL_LOAD_SCRIPT =
  'c="$1"; u="$2"; if command -v "$c" >/dev/null 2>&1; then exec "$c" -u"$u"; else exec mysql -u"$u"; fi';
// MongoDB: auth only with a user AND a password ($CBM_DB_PASSWORD from the env).
// $1 = tool, $2 = user, $3 = database ("" = all), then the tool's own flags.
const MONGO_SCRIPT =
  't="$1"; u="$2"; d="$3"; shift 3; ' +
  'if [ -n "$u" ] && [ -n "$CBM_DB_PASSWORD" ]; then ' +
  'set -- "$@" --username "$u" --password "$CBM_DB_PASSWORD" --authenticationDatabase admin; fi; ' +
  'if [ -n "$d" ]; then set -- "$@" --db "$d"; fi; ' +
  'exec "$t" "$@"';

/** Produce a logical dump of a database container into outFile. */
export async function dumpDatabase(
  type: ResourceType,
  container: string,
  db: DbCredentials,
  outFile: string,
): Promise<void> {
  const user = db.user ?? "";
  const password = db.password ?? "";
  const database = db.database ?? "";

  switch (type) {
    case "postgresql": {
      // No shell: user/database are plain argv entries.
      const s = secret("PGPASSWORD", password);
      const args = ["exec", ...s.args, container, "pg_dump", "-U", user || "postgres", "--clean", "--if-exists", "--no-owner"];
      if (database) args.push("-d", database);
      await dockerToFile(args, outFile, s.env);
      return;
    }
    case "mysql":
    case "mariadb": {
      const s = secret("MYSQL_PWD", password);
      const tool = type === "mariadb" ? "mariadb-dump" : "mysqldump";
      await dockerToFile(
        ["exec", ...s.args, container, "sh", "-c", MYSQL_DUMP_SCRIPT, "sh", tool, user || "root", database],
        outFile,
        s.env,
      );
      return;
    }
    case "mongodb": {
      const s = secret("CBM_DB_PASSWORD", user ? password : "");
      await dockerToFile(
        ["exec", ...s.args, container, "sh", "-c", MONGO_SCRIPT, "sh", "mongodump", user, database, "--archive"],
        outFile,
        s.env,
      );
      return;
    }
    default:
      throw new Error(`No logical dump supported for type ${type}`);
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
  const fh = await open(outFile, "r");
  try {
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    if (buf.toString("latin1") !== "REDIS") throw new Error("Redis RDB export has an invalid header");
  } finally {
    await fh.close();
  }
}

/** Restore a logical dump into a running database container. */
export async function restoreDatabase(
  type: ResourceType,
  container: string,
  db: DbCredentials,
  inFile: string,
): Promise<void> {
  const user = db.user ?? "";
  const password = db.password ?? "";
  const database = db.database ?? "";

  switch (type) {
    case "postgresql": {
      const s = secret("PGPASSWORD", password);
      const args = ["exec", "-i", ...s.args, container, "psql", "-U", user || "postgres"];
      if (database) args.push("-d", database);
      await dockerFromFile(args, inFile, s.env);
      return;
    }
    case "mysql":
    case "mariadb": {
      const s = secret("MYSQL_PWD", password);
      const client = type === "mariadb" ? "mariadb" : "mysql";
      await dockerFromFile(
        ["exec", "-i", ...s.args, container, "sh", "-c", MYSQL_LOAD_SCRIPT, "sh", client, user || "root"],
        inFile,
        s.env,
      );
      return;
    }
    case "mongodb": {
      const s = secret("CBM_DB_PASSWORD", user ? password : "");
      // No --db: the archive carries its databases; --drop replaces them.
      await dockerFromFile(
        ["exec", "-i", ...s.args, container, "sh", "-c", MONGO_SCRIPT, "sh", "mongorestore", user, "", "--archive", "--drop"],
        inFile,
        s.env,
      );
      return;
    }
    default:
      throw new Error(`No logical restore supported for type ${type}`);
  }
}
