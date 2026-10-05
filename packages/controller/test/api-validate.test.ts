import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, snapshotsQuery, jobsQuery, resourcesQuery, verifyQuery } from "../src/lib/api-validate";

const req = (qs: string) => new Request(`http://x/api/v1/thing${qs}`);

test("valid snapshot filters pass and limit is coerced to a number", () => {
  const r = parseQuery(snapshotsQuery, req("?status=succeeded&resourceId=r1&limit=20"));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.data, { status: "succeeded", resourceId: "r1", limit: 20 });
});

test("an unknown status is rejected with a 400, not passed to the DB", async () => {
  const r = parseQuery(snapshotsQuery, req("?status=DROP%20TABLE"));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.response.status, 400);
    const body = (await r.response.json()) as { error: string; issues: { path: string }[] };
    assert.equal(body.error, "invalid query");
    assert.equal(body.issues[0].path, "status");
  }
});

test("limit is bounded per endpoint", () => {
  assert.equal(parseQuery(snapshotsQuery, req("?limit=200")).ok, true);
  assert.equal(parseQuery(snapshotsQuery, req("?limit=201")).ok, false);
  assert.equal(parseQuery(jobsQuery, req("?limit=100")).ok, true);
  assert.equal(parseQuery(jobsQuery, req("?limit=101")).ok, false);
  assert.equal(parseQuery(jobsQuery, req("?limit=0")).ok, false);
  assert.equal(parseQuery(jobsQuery, req("?limit=abc")).ok, false);
});

test("job type/status must be known values", () => {
  assert.equal(parseQuery(jobsQuery, req("?type=verify-destination&status=queued")).ok, true);
  assert.equal(parseQuery(jobsQuery, req("?type=rm-rf")).ok, false);
});

test("booleans are strict true/false", () => {
  assert.equal(parseQuery(resourcesQuery, req("?backupEnabled=true")).ok, true);
  assert.equal(parseQuery(resourcesQuery, req("?backupEnabled=yes")).ok, false);
  assert.equal(parseQuery(verifyQuery, req("?deep=false")).ok, true);
  assert.equal(parseQuery(verifyQuery, req("?deep=1")).ok, false);
});

test("no filters at all is valid", () => {
  assert.equal(parseQuery(snapshotsQuery, req("")).ok, true);
  assert.equal(parseQuery(jobsQuery, req("")).ok, true);
});
