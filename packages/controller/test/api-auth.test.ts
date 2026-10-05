import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBearer, tokenExpired, normalizeRole } from "../src/lib/api-auth";

test("parseBearer extracts the token from an Authorization header", () => {
  assert.equal(parseBearer("Bearer cbm_pat_abc"), "cbm_pat_abc");
  assert.equal(parseBearer("bearer   cbm_pat_abc  "), "cbm_pat_abc");
});

test("parseBearer rejects missing, malformed or empty credentials", () => {
  assert.equal(parseBearer(null), null);
  assert.equal(parseBearer(undefined), null);
  assert.equal(parseBearer(""), null);
  assert.equal(parseBearer("cbm_pat_abc"), null); // no scheme
  assert.equal(parseBearer("Basic dXNlcjpwYXNz"), null); // wrong scheme
  assert.equal(parseBearer("Bearer    "), null); // empty token
});

test("tokenExpired honours an optional expiry", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(tokenExpired(null, now), false);
  assert.equal(tokenExpired(undefined, now), false);
  assert.equal(tokenExpired(new Date(now + 60_000), now), false);
  assert.equal(tokenExpired(new Date(now), now), true); // exactly at expiry
  assert.equal(tokenExpired(new Date(now - 1), now), true);
});

test("normalizeRole maps stored roles, unknown → viewer (least privilege)", () => {
  assert.equal(normalizeRole("admin"), "admin");
  assert.equal(normalizeRole("operator"), "operator");
  assert.equal(normalizeRole("viewer"), "viewer");
  assert.equal(normalizeRole("superuser"), "viewer");
  assert.equal(normalizeRole(""), "viewer");
  assert.equal(normalizeRole(null), "viewer");
});
