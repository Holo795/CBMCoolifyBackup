import { redactSecrets, RESTIC_PART_META, type RestoreDrillJob, type DrillCheck, type Artifact, type ResourceType, type DbCredentials } from "@cbm/shared";
import { mkdtemp, rm, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { stagePlaintext } from "./stage.js";
import { withResticCtx } from "./restic.js";
import { partKind, resticCountPath, resticRestorePath } from "./restic-helper.js";
import { docker, restoreVolume, tarEntryCount, writeFileIntoVolume, type RunResult } from "./docker.js";
import { restoreDatabase } from "./dump.js";
import { detectEngine } from "./engines.js";
import type { Emit } from "./backup.js";

/**
 * Restore drill: prove a snapshot is restorable without touching Coolify.
 *
 * Artifacts are staged back to plaintext (the same path a restore uses), then:
 *  - SQL/document dumps are loaded into a throwaway container of the same
 *    engine and the restored tables are counted against the dump;
 *  - Redis RDB exports are loaded by a throwaway redis-server;
 *  - volume/bind archives are read back end to end (a volume restic read in
 *    place is read back from the repository, without a local copy).
 * Sandboxes have NO network (`--network none`), random credentials, and are
 * always removed. Nothing here talks to Coolify or to the original resource.
 */

/** Sandbox image per engine when neither the artifact nor the resource recorded one. */
export const DEFAULT_IMAGES: Record<string, string> = {
  postgresql: "postgres:16-alpine",
  mysql: "mysql:8.4",
  mariadb: "mariadb:11",
  mongodb: "mongo:7",
  redis: "redis:7-alpine",
};

const SQL_ENGINES = new Set(["postgresql", "mysql", "mariadb", "mongodb"]);
const RDB_ENGINES = new Set(["redis", "keydb", "dragonfly"]);
/** A sandbox older than this can only be a leftover from a crashed agent. */
const STALE_SANDBOX_MS = 12 * 3600_000;

/** Engine of a db-dump artifact: recorded in its meta, else parsed from the file name. */
export function dumpEngine(a: Pick<Artifact, "filename" | "meta">): string | null {
  if (a.meta?.engine) return a.meta.engine;
  const m = /^dump-([a-z]+)-/.exec(a.filename);
  return m ? m[1] : null;
}

/** Sandbox image: the artifact's recorded image, else the resource's DB image when it's
 * the same engine, else the engine default. Null when we have nothing to run. */
export function sandboxImage(engine: string, artifactImage?: string, resourceDbImage?: string): string | null {
  if (artifactImage) return artifactImage;
  if (resourceDbImage && detectEngine(resourceDbImage) === engine) return resourceDbImage;
  return DEFAULT_IMAGES[engine] ?? null;
}

/** Number of `CREATE TABLE` statements in SQL text (pg_dump / mysqldump style). */
export function countCreateTables(sql: string): number {
  return (sql.match(/^CREATE TABLE /gim) ?? []).length;
}

/** Same as countCreateTables, streamed so a large dump isn't loaded in memory. */
async function countCreateTablesInFile(path: string): Promise<number> {
  let n = 0;
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (/^CREATE TABLE /i.test(line)) n++;
  return n;
}

/** Pass/fail for a SQL load: every table declared by the dump must be there. */
export function sqlVerdict(declared: number, restored: number, image: string): { ok: boolean; detail: string } {
  if (declared === 0) return { ok: true, detail: `empty database - the dump loaded cleanly into ${image}` };
  if (restored >= declared) return { ok: true, detail: `restored ${restored}/${declared} tables into a sandbox ${image}` };
  return { ok: false, detail: `only ${restored}/${declared} tables restored into ${image} - the dump did not load completely` };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Sandbox = { name: string; engine: string; image: string; creds: DbCredentials; volume?: string };

function sandboxName(jobId: string, n: number): string {
  return `cbm-drill-${jobId.replace(/[^a-zA-Z0-9]/g, "").slice(-10)}-${n}`;
}

const LABELS = (startedAt: number) => ["--label", "cbm.drill=1", "--label", `cbm.drill.started=${startedAt}`];

/** Remove sandboxes left behind by a crashed agent (never one a live drill could own). */
async function sweepStaleSandboxes(now = Date.now()): Promise<void> {
  const r = await docker(["ps", "-a", "--filter", "label=cbm.drill=1", "--format", '{{.Names}} {{.Label "cbm.drill.started"}}']);
  if (r.code !== 0) return;
  for (const line of r.stdout.split("\n")) {
    const [name, started] = line.trim().split(/\s+/);
    if (name && Number(started) > 0 && now - Number(started) > STALE_SANDBOX_MS) {
      await docker(["rm", "-f", "-v", name]).catch(() => undefined);
    }
  }
}

async function removeSandbox(sb: Sandbox): Promise<void> {
  await docker(["rm", "-f", "-v", sb.name]).catch(() => undefined);
  if (sb.volume) await docker(["volume", "rm", "-f", sb.volume]).catch(() => undefined);
}

/** Start a network-less database container with throwaway credentials (passed
 * through docker's environment, never its arguments). */
async function startSqlSandbox(engine: string, image: string, name: string): Promise<Sandbox> {
  const pw = randomBytes(18).toString("base64url");
  let env: string[];
  let secrets: Record<string, string>;
  let creds: DbCredentials;
  if (engine === "postgresql") {
    env = ["-e", "POSTGRES_USER=cbm", "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB=drill"];
    secrets = { POSTGRES_PASSWORD: pw };
    creds = { user: "cbm", password: pw, database: "drill" };
  } else if (engine === "mongodb") {
    env = ["-e", "MONGO_INITDB_ROOT_USERNAME=cbm", "-e", "MONGO_INITDB_ROOT_PASSWORD"];
    secrets = { MONGO_INITDB_ROOT_PASSWORD: pw };
    creds = { user: "cbm", password: pw };
  } else {
    // MariaDB images also honour the MYSQL_* variables; set both to be safe.
    env = ["-e", "MYSQL_ROOT_PASSWORD", "-e", "MARIADB_ROOT_PASSWORD"];
    secrets = { MYSQL_ROOT_PASSWORD: pw, MARIADB_ROOT_PASSWORD: pw };
    creds = { user: "root", password: pw };
  }
  const r = await docker(["run", "-d", "--name", name, "--network", "none", ...LABELS(Date.now()), ...env, image], secrets);
  if (r.code !== 0) throw new Error(`could not start a ${engine} sandbox from ${image}: ${r.stderr.trim().slice(0, 300)}`);
  return { name, engine, image, creds };
}

/** `docker exec` into the sandbox with its password in $CBM_SB_PW (from the env). */
function sandboxExec(sb: Sandbox, script: string): Promise<RunResult> {
  return docker(["exec", "-e", "CBM_SB_PW", sb.name, "sh", "-c", script], { CBM_SB_PW: sb.creds.password ?? "" });
}

const MONGO_SHELL = (js: string) =>
  `(command -v mongosh >/dev/null 2>&1 && mongosh --quiet -u cbm -p "$CBM_SB_PW" --authenticationDatabase admin --eval '${js}') || ` +
  `mongo --quiet -u cbm -p "$CBM_SB_PW" --authenticationDatabase admin --eval '${js}'`;
const MYSQL_SHELL = (sql: string) =>
  `(command -v mariadb >/dev/null 2>&1 && MYSQL_PWD="$CBM_SB_PW" mariadb -uroot -N -e "${sql}") || MYSQL_PWD="$CBM_SB_PW" mysql -uroot -N -e "${sql}"`;
const PG_SHELL = (sql: string) => `PGPASSWORD="$CBM_SB_PW" psql -U cbm -d drill -tAc "${sql}"`;

/** Succeeds only once the engine answers queries. */
function readinessProbe(sb: Sandbox): Promise<RunResult> {
  if (sb.engine === "postgresql") return sandboxExec(sb, PG_SHELL("select 1"));
  if (sb.engine === "mongodb") return sandboxExec(sb, MONGO_SHELL("db.adminCommand({ping:1}).ok"));
  // redis-cli exits 0 even on a "-LOADING" reply, so require a literal PONG.
  if (sb.engine === "redis") return sandboxExec(sb, '[ "$(redis-cli ping)" = "PONG" ]');
  return sandboxExec(sb, MYSQL_SHELL("select 1"));
}

/**
 * Wait until the sandbox answers several probes in a row. The official images
 * run a temporary server during first-boot init and then restart it, so a
 * single successful probe isn't enough.
 */
async function waitReady(sb: Sandbox, timeoutMs = 240_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let streak = 0;
  while (Date.now() < deadline) {
    const r = await readinessProbe(sb);
    streak = r.code === 0 ? streak + 1 : 0;
    if (streak >= 3) return;
    const state = await docker(["inspect", "-f", "{{.State.Running}}", sb.name]);
    if (state.stdout.trim() === "false") {
      const logs = await docker(["logs", "--tail", "15", sb.name]);
      throw new Error(`the ${sb.engine} sandbox stopped during startup: ${(logs.stderr || logs.stdout).trim().slice(-400)}`);
    }
    await sleep(2000);
  }
  throw new Error(`the ${sb.engine} sandbox did not become ready within ${Math.round(timeoutMs / 1000)}s`);
}

/** How many tables/collections the sandbox holds after the load. */
async function countRestored(sb: Sandbox): Promise<number> {
  let r: RunResult;
  if (sb.engine === "postgresql") {
    // Summed over every database: a dump carries all of the server's databases.
    const q = "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='BASE TABLE'";
    r = await sandboxExec(
      sb,
      `PGPASSWORD="$CBM_SB_PW" psql -U cbm -d drill -AtXc "select datname from pg_database where not datistemplate and datallowconn" | ` +
        `while IFS= read -r d; do PGPASSWORD="$CBM_SB_PW" psql -U cbm -d "$d" -AtXc "${q}"; done | awk '{s+=$1} END {print s+0}'`,
    );
  } else if (sb.engine === "mongodb") {
    r = await sandboxExec(
      sb,
      MONGO_SHELL(
        "let n=0;db.adminCommand({listDatabases:1}).databases.filter(d=>![\"admin\",\"config\",\"local\"].includes(d.name))" +
          ".forEach(d=>{n+=db.getSiblingDB(d.name).getCollectionNames().length});print(n)",
      ),
    );
  } else {
    r = await sandboxExec(
      sb,
      MYSQL_SHELL(
        "select count(*) from information_schema.tables where table_schema not in " +
          "('mysql','information_schema','performance_schema','sys') and table_type='BASE TABLE'",
      ),
    );
  }
  const n = Number.parseInt(r.stdout.trim().split("\n").pop() ?? "", 10);
  if (r.code !== 0 || !Number.isFinite(n)) throw new Error(`could not count restored objects: ${r.stderr.trim().slice(0, 300)}`);
  return n;
}

async function drillSqlDump(file: string, engine: string, image: string, name: string): Promise<{ ok: boolean; detail: string }> {
  const sb = await startSqlSandbox(engine, image, name);
  try {
    await waitReady(sb);
    await restoreDatabase(engine as ResourceType, sb.name, sb.creds, file);
    const restored = await countRestored(sb);
    if (engine === "mongodb") {
      return { ok: true, detail: `restored ${restored} collection(s) into a sandbox ${image}` };
    }
    return sqlVerdict(await countCreateTablesInFile(file), restored, image);
  } finally {
    await removeSandbox(sb);
  }
}

/** True when the file starts with the RDB magic. */
async function hasRdbHeader(file: string): Promise<boolean> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(5);
    const { bytesRead } = await fh.read(buf, 0, 5, 0);
    return bytesRead === 5 && buf.toString("latin1") === "REDIS";
  } finally {
    await fh.close();
  }
}

async function drillRdb(file: string, engine: string, image: string | null, name: string): Promise<{ ok: boolean; detail: string }> {
  if (!(await hasRdbHeader(file))) return { ok: false, detail: "not a valid RDB file (bad header)" };
  // Only plain Redis is loaded for real; KeyDB/Dragonfly RDBs get the header check.
  if (engine !== "redis" || !image) return { ok: true, detail: `RDB header valid (a full load is only drilled for redis)` };
  const volume = `${name}-data`;
  const sb: Sandbox = { name, engine: "redis", image, creds: {}, volume };
  try {
    await writeFileIntoVolume(volume, "dump.rdb", file);
    const r = await docker([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "none",
      ...LABELS(Date.now()),
      "-v",
      `${volume}:/data`,
      image,
      "redis-server",
      "--dir",
      "/data",
      "--dbfilename",
      "dump.rdb",
      "--appendonly",
      "no",
    ]);
    if (r.code !== 0) throw new Error(`could not start a redis sandbox from ${image}: ${r.stderr.trim().slice(0, 300)}`);
    await waitReady(sb);
    const size = await docker(["exec", name, "redis-cli", "dbsize"]);
    const keys = Number.parseInt(size.stdout.trim(), 10);
    if (size.code !== 0 || !Number.isFinite(keys)) throw new Error("redis sandbox did not report a key count");
    return { ok: true, detail: `loaded ${keys} key(s) into a sandbox ${image}` };
  } finally {
    await removeSandbox(sb);
  }
}

/** What the volume of a database needs to be started in a sandbox (recorded at backup). */
type DbFolder = { engine: string; image: string; path: string; user?: string; dataDir?: string };

/** The database a volume artifact holds, if the backup recorded one we can start. */
export function dbFolderOf(meta: Record<string, string> | undefined): DbFolder | null {
  const engine = meta?.dbEngine;
  if (!engine || !SQL_ENGINES.has(engine) || !meta.dbPath?.startsWith("/")) return null;
  const image = meta.dbImage || DEFAULT_IMAGES[engine];
  if (!image) return null;
  return { engine, image, path: meta.dbPath, user: meta.dbUser, dataDir: meta.dbDataDir };
}

/** How a sandbox starts the database on a copied data folder: no network, and
 * no access control (nothing can reach it) so it opens without the original
 * passwords. */
export function dbFolderRun(db: DbFolder): { env: string[]; args: string[] } {
  if (db.engine === "postgresql") {
    const env = db.dataDir ? ["-e", `PGDATA=${db.dataDir}`] : [];
    const hba = "/tmp/cbm_hba.conf";
    return {
      env,
      args: [
        "--entrypoint",
        "sh",
        db.image,
        "-c",
        `printf 'local all all trust\\n' > ${hba} && chmod 644 ${hba} && exec docker-entrypoint.sh postgres -c hba_file=${hba} -c listen_addresses=''`,
      ],
    };
  }
  if (db.engine === "mongodb") return { env: [], args: [db.image] };
  // MySQL / MariaDB: the official entrypoint prepends the server to "--" flags.
  return { env: [], args: [db.image, "--skip-grant-tables", "--skip-networking"] };
}

/** The probe and the table count for a database started by dbFolderRun. */
function dbFolderQueries(db: DbFolder): { probe: string; count: string } {
  const user = db.user || "postgres";
  if (db.engine === "postgresql") {
    const q = "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='BASE TABLE'";
    return {
      probe: `psql -U ${shWord(user)} -d postgres -AtXc "select 1"`,
      count:
        `psql -U ${shWord(user)} -d postgres -AtXc "select datname from pg_database where not datistemplate and datallowconn" | ` +
        `while IFS= read -r d; do psql -U ${shWord(user)} -d "$d" -AtXc "${q}"; done | awk '{s+=$1} END {print s+0}'`,
    };
  }
  if (db.engine === "mongodb") {
    const js = (body: string) => `(command -v mongosh >/dev/null 2>&1 && mongosh --quiet --eval '${body}') || mongo --quiet --eval '${body}'`;
    return {
      probe: js("db.adminCommand({ping:1}).ok"),
      count: js(
        "let n=0;db.adminCommand({listDatabases:1}).databases.filter(d=>![\"admin\",\"config\",\"local\"].includes(d.name))" +
          ".forEach(d=>{n+=db.getSiblingDB(d.name).getCollectionNames().length});print(n)",
      ),
    };
  }
  const sql = (q: string) => `(command -v mariadb >/dev/null 2>&1 && mariadb -uroot -N -e "${q}") || mysql -uroot -N -e "${q}"`;
  return {
    probe: sql("select 1"),
    count: sql(
      "select count(*) from information_schema.tables where table_schema not in " +
        "('mysql','information_schema','performance_schema','sys') and table_type='BASE TABLE'",
    ),
  };
}

const shWord = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Start the database a volume holds on a copy of it, in a network-less sandbox:
 * proves the copy (taken frozen, like after a power cut) opens - the engine
 * recovers its journal - and counts its tables. For a resource whose database
 * couldn't be dumped, this is the only proof its data restores.
 */
async function drillDbFolder(db: DbFolder, fill: (volume: string) => Promise<void>, name: string): Promise<{ ok: boolean; detail: string }> {
  const volume = `${name}-data`;
  const sb: Sandbox = { name, engine: db.engine, image: db.image, creds: {}, volume };
  try {
    await docker(["volume", "create", volume]);
    await fill(volume);
    const run = dbFolderRun(db);
    const r = await docker(["run", "-d", "--name", name, "--network", "none", ...LABELS(Date.now()), "-v", `${volume}:${db.path}`, ...run.env, ...run.args]);
    if (r.code !== 0) throw new Error(`could not start ${db.image} on the copy: ${r.stderr.trim().slice(0, 300)}`);
    const q = dbFolderQueries(db);
    // A crash recovery on a large database takes a while.
    const deadline = Date.now() + 600_000;
    let streak = 0;
    while (streak < 3) {
      if (Date.now() > deadline) throw new Error(`${db.image} did not open the copy within 10 minutes`);
      const p = await docker(["exec", name, "sh", "-c", q.probe]);
      streak = p.code === 0 ? streak + 1 : 0;
      if (streak >= 3) break;
      const state = await docker(["inspect", "-f", "{{.State.Running}}", name]);
      if (state.stdout.trim() === "false") {
        const logs = await docker(["logs", "--tail", "15", name]);
        throw new Error(`${db.image} stopped on the copy: ${(logs.stderr || logs.stdout).trim().slice(-400)}`);
      }
      await sleep(2000);
    }
    const c = await docker(["exec", name, "sh", "-c", q.count]);
    const n = Number.parseInt(c.stdout.trim().split("\n").pop() ?? "", 10);
    if (c.code !== 0 || !Number.isFinite(n)) throw new Error(`could not count its tables: ${c.stderr.trim().slice(0, 300)}`);
    const what = db.engine === "mongodb" ? "collection(s)" : "table(s)";
    return { ok: true, detail: `started ${db.image} on the copy of its files: ${n} ${what}` };
  } finally {
    await removeSandbox(sb);
  }
}

/** Run a restore drill; never throws for a failed check (it's reported), only for staging. */
export async function runRestoreDrill(
  job: RestoreDrillJob,
  workDir: string,
  emit: Emit,
): Promise<{ ok: boolean; checks: DrillCheck[]; durationMs: number }> {
  const started = Date.now();
  await sweepStaleSandboxes().catch(() => undefined);
  const stage = await mkdtemp(join(workDir, "drill-"));
  try {
    emit("info", "Fetching the snapshot for a restore drill", 10);
    const plain = await stagePlaintext(
      {
        source: job.source,
        storage: job.storage,
        manifest: job.manifest,
        dir: job.dir,
        resticSnapshotId: job.resticSnapshotId,
        decryptionKey: job.decryptionKey,
      },
      stage,
      workDir,
      "skip",
    );

    const artifacts = job.manifest.artifacts ?? [];
    const checks: DrillCheck[] = [];
    let i = 0;
    for (const a of artifacts) {
      i++;
      const file = join(plain, a.filename.replace(/\.enc$/, ""));
      const progress = 15 + Math.round((80 * (i - 1)) / Math.max(artifacts.length, 1));
      const base: Omit<DrillCheck, "ok" | "detail"> = { artifact: a.filename, kind: a.kind };
      try {
        if (a.kind === "db-dump") {
          const engine = dumpEngine(a);
          const out = { ...base, engine: engine ?? undefined };
          if (engine && SQL_ENGINES.has(engine)) {
            const image = sandboxImage(engine, a.meta?.image, job.dbImage);
            emit("info", `Restoring ${a.filename} into a sandbox ${engine} (${image})`, progress);
            checks.push({ ...out, ...(await drillSqlDump(file, engine, image!, sandboxName(job.id, i))) });
          } else if (engine && RDB_ENGINES.has(engine)) {
            emit("info", `Loading ${a.filename} into a sandbox ${engine}`, progress);
            const image = sandboxImage(engine, a.meta?.image, job.dbImage);
            checks.push({ ...out, ...(await drillRdb(file, engine, image, sandboxName(job.id, i))) });
          } else {
            checks.push({ ...out, ok: true, detail: `no sandbox for engine "${engine ?? "unknown"}" - skipped` });
          }
        } else if (a.kind === "volume") {
          emit("info", `Reading back ${a.filename}`, progress);
          const part = a.meta?.[RESTIC_PART_META];
          // Read in place by restic: read it back from the repository, end to end.
          const read = part
            ? await withResticCtx(
                job.source,
                job.storage.resticPassword ?? "",
                async (ctx) => resticCountPath(ctx, workDir, part, a.meta.resticPath ?? "", await partKind(ctx, workDir, part, a.meta)),
                workDir,
              )
            : { kind: a.meta?.bindKind === "file" ? ("file" as const) : ("dir" as const), count: await tarEntryCount(file) };
          const n = read.count;
          checks.push({
            ...base,
            ok: true,
            detail:
              read.kind === "file"
                ? part
                  ? `file read back (${n} bytes)`
                  : "file read back"
                : n === 0
                  ? "empty archive (read back fine)"
                  : `${n} entries read back`,
          });
          // The files of a database that has no dump in this snapshot: start it on them.
          const db = dbFolderOf(a.meta);
          const dumped = artifacts.some((d) => d.kind === "db-dump" && d.meta?.container && d.meta.container === a.meta?.dbContainer);
          if (db && !dumped) {
            emit("info", `OK ${a.filename}: ${checks[checks.length - 1].detail}`, progress);
            emit("info", `Starting ${db.engine} (${db.image}) on a copy of ${a.filename} - its database has no dump here`, progress);
            const root = a.meta.rootOwner && a.meta.rootMode ? { owner: a.meta.rootOwner, mode: a.meta.rootMode } : undefined;
            const fill = (volume: string) =>
              part
                ? withResticCtx(
                    job.source,
                    job.storage.resticPassword ?? "",
                    (ctx) => resticRestorePath(ctx, workDir, part, a.meta.resticPath ?? "", volume, root),
                    workDir,
                  )
                : restoreVolume(volume, file);
            checks.push({ ...base, engine: db.engine, ...(await drillDbFolder(db, fill, `${sandboxName(job.id, i)}-db`)) });
          }
        } else {
          // config / image-ref: must be present and non-empty.
          const fh = await open(file, "r");
          const size = (await fh.stat()).size;
          await fh.close();
          checks.push({ ...base, ok: size > 0, detail: size > 0 ? "present and readable" : "empty file" });
        }
      } catch (e) {
        checks.push({ ...base, ok: false, detail: redactSecrets(e instanceof Error ? e.message : String(e)) });
      }
      const last = checks[checks.length - 1];
      emit(last.ok ? "info" : "error", `${last.ok ? "OK" : "FAILED"} ${a.filename}: ${last.detail}`, progress);
    }

    const ok = checks.length > 0 && checks.every((c) => c.ok);
    emit(ok ? "info" : "error", ok ? "Restore drill passed" : "Restore drill failed", 100);
    return { ok, checks, durationMs: Date.now() - started };
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
}
