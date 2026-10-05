import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { RestoreDrillJob, SnapshotManifest, Artifact } from "@cbm/shared";
import { dumpEngine, sandboxImage, countCreateTables, sqlVerdict, runRestoreDrill, DEFAULT_IMAGES } from "../src/drill.js";
import { encryptFile, generateKeyB64 } from "../src/crypto.js";
import { docker, dockerToFile } from "../src/docker.js";

/* --------------------------- pure helpers --------------------------- */

test("dumpEngine prefers the recorded meta, else parses the file name", () => {
  assert.equal(dumpEngine({ filename: "x.sql", meta: { engine: "mysql" } }), "mysql");
  assert.equal(dumpEngine({ filename: "dump-postgresql-app.sql", meta: {} }), "postgresql");
  assert.equal(dumpEngine({ filename: "dump-redis-cache.rdb", meta: {} }), "redis");
  assert.equal(dumpEngine({ filename: "weird.bin", meta: {} }), null);
});

test("sandboxImage: artifact image, then matching resource image, then default", () => {
  assert.equal(sandboxImage("postgresql", "postgres:15", "postgres:16"), "postgres:15");
  assert.equal(sandboxImage("postgresql", undefined, "pgvector/pgvector:pg16"), "pgvector/pgvector:pg16");
  // A resource image of another engine is ignored.
  assert.equal(sandboxImage("postgresql", undefined, "mysql:8"), DEFAULT_IMAGES.postgresql);
  assert.equal(sandboxImage("mongodb"), DEFAULT_IMAGES.mongodb);
  assert.equal(sandboxImage("unknown-engine"), null);
});

test("countCreateTables counts statements at line start, case-insensitively", () => {
  const sql = "CREATE TABLE a (id int);\n-- CREATE TABLE commented\ncreate table b (id int);\nSELECT 'CREATE TABLE x';\n";
  assert.equal(countCreateTables(sql), 2);
  assert.equal(countCreateTables(""), 0);
});

test("sqlVerdict passes only when every declared table is restored", () => {
  assert.equal(sqlVerdict(0, 0, "img").ok, true);
  assert.equal(sqlVerdict(3, 3, "img").ok, true);
  assert.equal(sqlVerdict(3, 5, "img").ok, true);
  const bad = sqlVerdict(3, 1, "img");
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /1\/3/);
});

/* ----------------------- real docker drills (opt-in) ----------------------- */

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";
const noop = () => {};

const art = (a: Partial<Artifact> & Pick<Artifact, "kind" | "filename">): Artifact =>
  ({ sizeBytes: 1, sha256: "x", encrypted: false, meta: {}, ...a }) as Artifact;

function manifestOf(artifacts: Artifact[]): SnapshotManifest {
  return {
    version: 1,
    resource: { coolifyUuid: "r1", name: "app", type: "postgresql", containerNames: [], volumes: [], bindMounts: [] },
    mode: "backup",
    captureMode: "cold",
    capturedAt: new Date().toISOString(),
    artifacts,
    provenance: {},
    encrypted: false,
    destinationDir: "snap1",
  } as unknown as SnapshotManifest;
}

function drillJob(base: string, manifest: SnapshotManifest, key?: string): RestoreDrillJob {
  return {
    id: `drill${Date.now()}`,
    type: "restore-drill",
    source: { type: "local", basePath: base },
    storage: { engine: "tar" },
    dir: "snap1",
    decryptionKey: key,
    manifest,
  } as RestoreDrillJob;
}

async function leftoverSandboxes(): Promise<string> {
  return (await docker(["ps", "-a", "--filter", "label=cbm.drill=1", "--format", "{{.Names}}"])).stdout.trim();
}

const GOOD_DUMP = [
  "CREATE TABLE public.users (id integer PRIMARY KEY, email text NOT NULL);",
  "CREATE TABLE public.orders (id integer PRIMARY KEY, user_id integer REFERENCES public.users(id));",
  "INSERT INTO public.users VALUES (1, 'a@example.com'), (2, 'b@example.com');",
  "INSERT INTO public.orders VALUES (10, 1);",
  "",
].join("\n");

test("drill passes a real postgres dump + encrypted volume + config", { skip: !DOCKER, timeout: 600_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-drill-"));
  try {
    const snap = join(dir, "dest", "snap1");
    await mkdir(snap, { recursive: true });
    await writeFile(join(snap, "dump-postgresql-app.sql"), GOOD_DUMP);
    // A real tar of a small tree, encrypted like a tar-engine artifact.
    const tree = join(dir, "tree");
    await mkdir(join(tree, "sub"), { recursive: true });
    await writeFile(join(tree, "a.txt"), "hello");
    await writeFile(join(tree, "sub", "b.txt"), "world");
    const tarPlain = join(dir, "volume-data.tar");
    execFileSync("tar", ["-cf", tarPlain, "-C", tree, "."]);
    const key = generateKeyB64();
    await encryptFile(tarPlain, join(snap, "volume-data.tar.enc"), key);
    await writeFile(join(snap, "config.json"), JSON.stringify({ ok: true }));

    const m = manifestOf([
      art({ kind: "db-dump", filename: "dump-postgresql-app.sql", meta: { engine: "postgresql", image: "postgres:16-alpine" } }),
      art({ kind: "volume", filename: "volume-data.tar.enc", encrypted: true, meta: { volume: "data" } }),
      art({ kind: "config", filename: "config.json" }),
    ]);
    const work = join(dir, "work");
    await mkdir(work, { recursive: true });
    const r = await runRestoreDrill(drillJob(join(dir, "dest"), m, key), work, noop);

    assert.equal(r.ok, true, JSON.stringify(r.checks));
    assert.match(r.checks[0].detail, /restored 2\/2 tables/);
    assert.match(r.checks[1].detail, /entries read back/);
    assert.equal(r.checks[2].ok, true);
    assert.equal(await leftoverSandboxes(), "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("drill fails a dump that doesn't fully load", { skip: !DOCKER, timeout: 600_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-drill-"));
  try {
    const snap = join(dir, "dest", "snap1");
    await mkdir(snap, { recursive: true });
    await writeFile(
      join(snap, "dump-postgresql-app.sql"),
      "CREATE TABLE public.good (id integer);\nCREATE TABLE public.broken (id not_a_type);\n",
    );
    const m = manifestOf([art({ kind: "db-dump", filename: "dump-postgresql-app.sql", meta: { engine: "postgresql" } })]);
    const work = join(dir, "work");
    await mkdir(work, { recursive: true });
    const r = await runRestoreDrill(drillJob(join(dir, "dest"), m), work, noop);
    assert.equal(r.ok, false);
    assert.match(r.checks[0].detail, /1\/2 tables/);
    assert.equal(await leftoverSandboxes(), "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("drill fails a corrupt volume archive", { skip: !DOCKER, timeout: 300_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-drill-"));
  try {
    const snap = join(dir, "dest", "snap1");
    await mkdir(snap, { recursive: true });
    await writeFile(join(snap, "volume-data.tar"), Buffer.from("this is definitely not a tar archive ".repeat(40)));
    const m = manifestOf([art({ kind: "volume", filename: "volume-data.tar" })]);
    const work = join(dir, "work");
    await mkdir(work, { recursive: true });
    const r = await runRestoreDrill(drillJob(join(dir, "dest"), m), work, noop);
    assert.equal(r.ok, false);
    assert.equal(r.checks[0].ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("drill loads a real Redis RDB export", { skip: !DOCKER, timeout: 300_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-drill-"));
  const src = `cbm-drill-src-${Date.now()}`;
  try {
    await docker(["run", "-d", "--name", src, "redis:7-alpine"]);
    for (let i = 0; i < 20; i++) {
      if ((await docker(["exec", src, "redis-cli", "ping"])).stdout.trim() === "PONG") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await docker(["exec", src, "redis-cli", "mset", "a", "1", "b", "2", "c", "3"]);
    const snap = join(dir, "dest", "snap1");
    await mkdir(snap, { recursive: true });
    await dockerToFile(["exec", src, "redis-cli", "--rdb", "-"], join(snap, "dump-redis-cache.rdb"));

    const m = manifestOf([art({ kind: "db-dump", filename: "dump-redis-cache.rdb", meta: { engine: "redis", image: "redis:7-alpine" } })]);
    const work = join(dir, "work");
    await mkdir(work, { recursive: true });
    const r = await runRestoreDrill(drillJob(join(dir, "dest"), m), work, noop);
    assert.equal(r.ok, true, JSON.stringify(r.checks));
    assert.match(r.checks[0].detail, /loaded 3 key/);
    assert.equal(await leftoverSandboxes(), "");
  } finally {
    await docker(["rm", "-f", src]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});
