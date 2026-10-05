import type { RestoreDrillJob, DrillCheck, Artifact, ResourceType, DbCredentials } from "@cbm/shared";
import { mkdtemp, rm, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { stagePlaintext } from "./stage.js";
import { docker, tarEntryCount, writeFileIntoVolume } from "./docker.js";
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
 *  - volume/bind archives are read back end to end.
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

/** Start a network-less database container with throwaway credentials. */
async function startSqlSandbox(engine: string, image: string, name: string): Promise<Sandbox> {
  const pw = randomBytes(18).toString("base64url");
  let env: string[];
  let creds: DbCredentials;
  if (engine === "postgresql") {
    env = ["-e", "POSTGRES_USER=cbm", "-e", `POSTGRES_PASSWORD=${pw}`, "-e", "POSTGRES_DB=drill"];
    creds = { user: "cbm", password: pw, database: "drill" };
  } else if (engine === "mongodb") {
    env = ["-e", "MONGO_INITDB_ROOT_USERNAME=cbm", "-e", `MONGO_INITDB_ROOT_PASSWORD=${pw}`];
    creds = { user: "cbm", password: pw };
  } else {
    // MariaDB images also honour the MYSQL_* variables; set both to be safe.
    env = ["-e", `MYSQL_ROOT_PASSWORD=${pw}`, "-e", `MARIADB_ROOT_PASSWORD=${pw}`];
    creds = { user: "root", password: pw };
  }
  const r = await docker(["run", "-d", "--name", name, "--network", "none", ...LABELS(Date.now()), ...env, image]);
  if (r.code !== 0) throw new Error(`could not start a ${engine} sandbox from ${image}: ${r.stderr.trim().slice(0, 300)}`);
  return { name, engine, image, creds };
}

/** In-container command that succeeds only once the engine answers queries. */
function readinessProbe(sb: Sandbox): string[] {
  const pw = sb.creds.password ?? "";
  if (sb.engine === "postgresql") return ["-e", `PGPASSWORD=${pw}`, sb.name, "psql", "-U", "cbm", "-d", "drill", "-tAc", "select 1"];
  if (sb.engine === "mongodb") {
    const auth = `-u cbm -p '${pw}' --authenticationDatabase admin`;
    const ev = `--quiet ${auth} --eval 'db.adminCommand({ping:1}).ok'`;
    return [sb.name, "sh", "-c", `(command -v mongosh >/dev/null 2>&1 && mongosh ${ev}) || mongo ${ev}`];
  }
  // redis-cli exits 0 even on a "-LOADING" reply, so require a literal PONG.
  if (sb.engine === "redis") return [sb.name, "sh", "-c", '[ "$(redis-cli ping)" = "PONG" ]'];
  return [
    "-e",
    `MYSQL_PWD=${pw}`,
    sb.name,
    "sh",
    "-c",
    "(command -v mariadb >/dev/null 2>&1 && mariadb -uroot -e 'select 1') || mysql -uroot -e 'select 1'",
  ];
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
    const r = await docker(["exec", ...readinessProbe(sb)]);
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
  const pw = sb.creds.password ?? "";
  let r;
  if (sb.engine === "postgresql") {
    r = await docker([
      "exec",
      "-e",
      `PGPASSWORD=${pw}`,
      sb.name,
      "psql",
      "-U",
      "cbm",
      "-d",
      "drill",
      "-tAc",
      "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='BASE TABLE'",
    ]);
  } else if (sb.engine === "mongodb") {
    const js =
      "let n=0;db.adminCommand({listDatabases:1}).databases.filter(d=>!['admin','config','local'].includes(d.name))" +
      ".forEach(d=>{n+=db.getSiblingDB(d.name).getCollectionNames().length});print(n)";
    const ev = `--quiet -u cbm -p '${pw}' --authenticationDatabase admin --eval "${js}"`;
    r = await docker(["exec", sb.name, "sh", "-c", `(command -v mongosh >/dev/null 2>&1 && mongosh ${ev}) || mongo ${ev}`]);
  } else {
    const q =
      "select count(*) from information_schema.tables where table_schema not in " +
      "('mysql','information_schema','performance_schema','sys') and table_type='BASE TABLE'";
    r = await docker([
      "exec",
      "-e",
      `MYSQL_PWD=${pw}`,
      sb.name,
      "sh",
      "-c",
      `(command -v mariadb >/dev/null 2>&1 && mariadb -uroot -N -e "${q}") || mysql -uroot -N -e "${q}"`,
    ]);
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
          const n = await tarEntryCount(file);
          checks.push({ ...base, ok: true, detail: n === 0 ? "empty archive (read back fine)" : `${n} entries read back` });
        } else {
          // config / image-ref: must be present and non-empty.
          const fh = await open(file, "r");
          const size = (await fh.stat()).size;
          await fh.close();
          checks.push({ ...base, ok: size > 0, detail: size > 0 ? "present and readable" : "empty file" });
        }
      } catch (e) {
        checks.push({ ...base, ok: false, detail: e instanceof Error ? e.message : String(e) });
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
