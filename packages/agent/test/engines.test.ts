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
