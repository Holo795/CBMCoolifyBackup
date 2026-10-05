import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { makeTransfer } from "../src/transfer.js";
import { docker } from "../src/docker.js";

/*
 * Real S3 behaviour (opt-in: CBM_DOCKER_TESTS=1) against SeaweedFS's S3 API -
 * MinIO no longer publishes free images. Port 19000 on localhost; the bucket is
 * created through the S3 API itself.
 */
const DOCKER = process.env.CBM_DOCKER_TESTS === "1";
const NAME = `cbm-s3test-${Date.now()}`;
const dest = {
  type: "s3" as const,
  endpoint: "http://127.0.0.1:19000",
  region: "us-east-1",
  bucket: "cbm-test",
  accessKeyId: "cbmtestkey",
  secretAccessKey: "cbmtestsecret123",
  forcePathStyle: true,
  prefix: "backups",
};

async function startS3(dir: string) {
  // SeaweedFS rejects a signed request from an unknown key: declare ours.
  const config = join(dir, "s3.json");
  await writeFile(
    config,
    JSON.stringify({
      identities: [
        {
          name: "cbm",
          credentials: [{ accessKey: dest.accessKeyId, secretKey: dest.secretAccessKey }],
          actions: ["Admin", "Read", "Write", "List", "Tagging"],
        },
      ],
    }),
  );
  const r = await docker([
    "run", "-d", "--name", NAME, "-p", "127.0.0.1:19000:8333", "-v", `${config}:/etc/seaweedfs/s3.json:ro`,
    "chrislusf/seaweedfs:latest", "server", "-s3", "-s3.config=/etc/seaweedfs/s3.json",
  ]);
  assert.equal(r.code, 0, r.stderr);
  const { S3Client, CreateBucketCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: dest.region,
    endpoint: dest.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: dest.accessKeyId, secretAccessKey: dest.secretAccessKey },
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: dest.bucket }));
        return;
      } catch {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
    throw new Error("the S3 server did not start");
  } finally {
    client.destroy();
  }
}

const sha = async (p: string) => createHash("sha256").update(await readFile(p)).digest("hex");

test("S3 transfer: multipart upload, folder-scoped list/delete, batched deletes", { skip: !DOCKER, timeout: 300_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cbm-s3-"));
  try {
    await startS3(dir);
    const t = await makeTransfer(dest as never);

    // 1. A file above the multipart threshold round-trips intact.
    const big = join(dir, "big.bin");
    await writeFile(big, randomBytes(80 * 1024 * 1024));
    await t.put(big, "inst/res/backups/2026-01-01/volume-data.tar");
    const back = join(dir, "back.bin");
    await t.get("inst/res/backups/2026-01-01/volume-data.tar", back);
    assert.equal(await sha(back), await sha(big));

    // 2. Folder semantics: the legacy "sync" folder is not a prefix of "sync-copies".
    const small = join(dir, "small.txt");
    await writeFile(small, "x");
    await t.put(small, "inst/res/sync/manifest.json");
    await t.put(small, "inst/res/sync-copies/2026-02-02/manifest.json");
    assert.deepEqual(await t.list("inst/res/sync"), ["inst/res/sync/manifest.json"]);
    await t.removeDir("inst/res/sync");
    assert.deepEqual(await t.list("inst/res/sync-copies"), ["inst/res/sync-copies/2026-02-02/manifest.json"]);
    assert.deepEqual(await t.list("inst/res/sync"), []);

    // 3. Deleting a folder with more than 1000 objects (DeleteObjects' limit).
    for (let i = 0; i < 1100; i++) await t.put(small, `inst/res/many/f${i}`);
    assert.equal((await t.list("inst/res/many")).length, 1100);
    await t.removeDir("inst/res/many");
    assert.equal((await t.list("inst/res/many")).length, 0);

    // 4. A missing object fails the download instead of hanging.
    await assert.rejects(() => t.get("inst/res/nope", join(dir, "nope")));
    await t.close();
  } finally {
    await docker(["rm", "-f", "-v", NAME]);
    await rm(dir, { recursive: true, force: true });
  }
});
