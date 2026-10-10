import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { captureTar } from "../src/capture.js";
import { docker, hostPathKind, restoreFileToPath, tarEntryCount } from "../src/docker.js";

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";

/** A host folder on the Docker host (not the test machine's /tmp, which a
 * remote or VM daemon may not share). */
const sh = (script: string) => docker(["run", "--rm", "-v", "/srv:/srv", "alpine:3.24", "sh", "-c", script]);

test("a host mount of a single file: copied, read back and restored in place", { skip: !DOCKER, timeout: 180_000 }, async () => {
  const dir = `/srv/cbm-file-bind-test-${process.pid}`;
  const file = `${dir}/nginx/default.conf`;
  const work = await mkdtemp(join(tmpdir(), "cbm-fb-"));
  try {
    await sh(`mkdir -p ${dir}/nginx ${dir}/data && printf 'server { listen 80; }\\n' > ${file} && chown 101:101 ${file} && chmod 640 ${file}`);
    assert.equal(await hostPathKind(file), "file");
    assert.equal(await hostPathKind(`${dir}/data`), "dir");

    const tar = join(work, "file.tar");
    await captureTar(file, (body) => pipeline(body, createWriteStream(tar)), undefined, [], true);
    assert.equal(await tarEntryCount(tar), 1);

    // Changed since, then restored: content, owner and mode back, same inode
    // (a container mounting the file keeps seeing it).
    const inode = (await sh(`stat -c %i ${file}`)).stdout.trim();
    await sh(`echo changed > ${file} && chmod 666 ${file} && chown 0:0 ${file}`);
    await restoreFileToPath(file, tar);
    const after = await sh(`stat -c '%u:%g %a %i' ${file}; cat ${file}`);
    assert.equal(after.stdout, `101:101 640 ${inode}\nserver { listen 80; }\n`);

    // Its folder gone: created again, the file written.
    await sh(`rm -rf ${dir}/nginx`);
    await restoreFileToPath(file, tar);
    assert.equal((await sh(`cat ${file}`)).stdout, "server { listen 80; }\n");
  } finally {
    await sh(`rm -rf ${dir}`);
    await rm(work, { recursive: true, force: true });
  }
});
