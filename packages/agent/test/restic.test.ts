import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { copiedIds, resticCopyContext, resticS3Endpoint } from "../src/restic.js";

test("restic S3 endpoint keeps the configured scheme", () => {
  assert.equal(resticS3Endpoint("http://minio:9000"), "http://minio:9000");
  assert.equal(resticS3Endpoint("https://s3.example.com/"), "https://s3.example.com");
  assert.equal(resticS3Endpoint("s3.example.com"), "https://s3.example.com");
  assert.equal(resticS3Endpoint(undefined), "s3.amazonaws.com");
});

test("restic copy: each source snapshot maps to its copy through `original`", () => {
  const snaps = [
    { id: "aaa111", original: "src0000000001" },
    { id: "bbb222", original: "src0000000002" },
    { id: "ccc333" },
  ];
  const map = copiedIds(snaps, ["src0000000001", "src00000", "missing1"]);
  assert.equal(map.get("src0000000001"), "aaa111");
  // A short id matches the full original it starts.
  assert.equal(map.get("src00000"), "aaa111");
  assert.equal(map.has("missing1"), false);
});

test("restic copy context: two S3 accounts can't share one process", async () => {
  const s3 = (key: string) => ({ type: "s3", bucket: "b", accessKeyId: key, secretAccessKey: "s", region: "r" }) as never;
  assert.equal(await resticCopyContext(s3("k1"), "p1", s3("k2"), "p2"), null);
  const same = await resticCopyContext(s3("k1"), "p1", { type: "local", basePath: "/x" } as never, "p2");
  assert.ok(same);
  assert.equal(same.env.RESTIC_FROM_PASSWORD, "p1");
  assert.equal(same.env.RESTIC_PASSWORD, "p2");
  assert.equal(same.env.RESTIC_REPOSITORY, "/x/restic-repo");
  assert.match(same.env.RESTIC_FROM_REPOSITORY ?? "", /^s3:.*\/b\/restic-repo$/);
  assert.equal(same.env.AWS_ACCESS_KEY_ID, "k1");
  await same.cleanup();
});

test("restic copy context: two SFTP repositories each get their own connection", async () => {
  const ssh = (host: string, username: string) =>
    ({ type: "ssh", host, port: 2222, username, password: "pw", basePath: "/data", jumpPort: 22 }) as never;
  const ctx = await resticCopyContext(ssh("a.example", "u1"), "p1", ssh("b.example", "u2"), "p2");
  assert.ok(ctx);
  assert.equal(ctx.env.RESTIC_FROM_REPOSITORY, "sftp://u1@a.example:2222//data/restic-repo");
  assert.equal(ctx.env.RESTIC_REPOSITORY, "sftp://u2@b.example:2222//data/restic-repo");
  assert.deepEqual(ctx.args, []);
  const dir = (ctx.env.PATH ?? "").split(":")[0];
  const script = await readFile(join(dir, "ssh"), "utf8");
  assert.match(script, /'u1@a\.example:2222'\) exec /);
  assert.match(script, /'u2@b\.example:2222'\) exec /);
  // The real ssh the connect scripts run must not resolve to the dispatcher.
  assert.ok(!script.includes(`PATH='${dir}`));
  await ctx.cleanup();
  await assert.rejects(stat(dir));
});
