import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEngine, isRedisEngine, isSqlEngine } from "../src/engines.js";

test("detectEngine maps images to engines (most specific wins)", () => {
  assert.equal(detectEngine("postgres:16-alpine"), "postgresql");
  assert.equal(detectEngine("ghcr.io/supabase/postgres:15"), "postgresql");
  assert.equal(detectEngine("mariadb:11"), "mariadb");
  assert.equal(detectEngine("mysql:8.0"), "mysql");
  assert.equal(detectEngine("mongo:7"), "mongodb");
  assert.equal(detectEngine("redis:7-alpine"), "redis");
  assert.equal(detectEngine("eqalpha/keydb:latest"), "keydb");
  assert.equal(detectEngine("docker.dragonflydb.io/dragonflydb/dragonfly"), "dragonfly");
  assert.equal(detectEngine("nginx:latest"), null);
  assert.equal(detectEngine(undefined), null);
});

test("engine family helpers", () => {
  assert.equal(isRedisEngine("redis"), true);
  assert.equal(isRedisEngine("postgresql"), false);
  assert.equal(isSqlEngine("postgresql"), true);
  assert.equal(isSqlEngine("dragonfly"), false);
});

test("stripRdbEofMark removes redis-cli's trailing replication mark only", async () => {
  const { stripRdbEofMark } = await import("../src/dump.js");
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "cbm-rdb-"));
  try {
    const rdb = Buffer.concat([Buffer.from("REDIS0012"), Buffer.alloc(30, 7), Buffer.from([0xff]), Buffer.alloc(8, 1)]);
    const marked = join(dir, "marked.rdb");
    await writeFile(marked, Buffer.concat([rdb, Buffer.from("5c810ec189f8c5f95ec65ce3e117b4a67d2e2c9b")]));
    assert.equal(await stripRdbEofMark(marked), true);
    assert.deepEqual(await readFile(marked), rdb);
    const clean = join(dir, "clean.rdb");
    await writeFile(clean, rdb);
    assert.equal(await stripRdbEofMark(clean), false);
    assert.deepEqual(await readFile(clean), rdb);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
