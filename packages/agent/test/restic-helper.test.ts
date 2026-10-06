import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, realpath, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docker } from "../src/docker.js";
import { resticContext, resticEnsureRepo, resticForget, resticListSnapshotIds, setResticBin } from "../src/restic.js";
import { resticBackupPath, resticCountPath, resticRestorePath, resticTarPath, snapshotPath } from "../src/restic-helper.js";

const DOCKER = process.env.CBM_DOCKER_TESTS === "1";
const IMAGE = (process.env.AGENT_HELPER_IMAGE ??= "ghcr.io/holo795/cbm-agent:latest");

test("snapshot paths are stable and safe", () => {
  assert.equal(snapshotPath("volume", "abc_data-1"), "/volume/abc_data-1");
  assert.equal(snapshotPath("bind", "srv/app data"), "/bind/srv_app_data");
  assert.throws(() => snapshotPath("volume", ".."));
});

/* ------------------- real Docker (CBM_DOCKER_TESTS=1) ------------------- */

const sh = (vol: string, script: string) =>
  docker(["run", "--rm", "-v", `${vol}:/d`, "alpine:3.24", "sh", "-c", script]).then((r) => {
    assert.equal(r.code, 0, r.stderr);
    return r.stdout.trim();
  });

test("restic in place: incremental passes, read-back, restore and tar copy", { skip: !DOCKER, timeout: 600_000 }, async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "cbm-rh-")));
  const id = Math.random().toString(36).slice(2, 8);
  const src = `cbm-rh-src-${id}`;
  const dst = `cbm-rh-dst-${id}`;
  // The agent runs restic natively for the repository itself: here, through the image.
  const wrapper = join(dir, "restic");
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec docker run --rm -i --network host -e RESTIC_PASSWORD -e RESTIC_REPOSITORY -v ${dir}:${dir} --entrypoint restic ${IMAGE} "$@"\n`,
  );
  await chmod(wrapper, 0o755);
  setResticBin(wrapper);
  const work = join(dir, "work");
  try {
    await sh(src, "mkdir -p /d/sub && head -c 5000000 /dev/urandom > /d/big.bin && echo hi > /d/sub/a.txt && ln -s sub/a.txt /d/link && chown 999:999 /d && chmod 700 /d");
    const ctx = await resticContext({ type: "local", basePath: join(dir, "dest") } as never, "pw", dir);
    await docker(["run", "--rm", "-v", `${dir}:${dir}`, "alpine:3.24", "mkdir", "-p", join(dir, "dest"), work]);
    await resticEnsureRepo(ctx);
    const path = snapshotPath("volume", src);

    const first = await resticBackupPath(ctx, work, src, path, ["snap:t1"]);
    assert.equal(first.filesNew, 2);
    assert.ok(first.bytes >= 5_000_000);
    await sh(src, "echo more > /d/sub/b.txt");
    const second = await resticBackupPath(ctx, work, src, path, ["snap:t1"]);
    assert.equal(second.filesNew, 1, "only the new file is new");
    assert.equal(second.filesUnmodified, 2, "unchanged files aren't read again");
    assert.ok(second.added < 100_000, `small increment (${second.added})`);

    // Read back end to end: ., sub, sub/a.txt, sub/b.txt, big.bin, link (+ the root)
    assert.ok((await resticCountPath(ctx, work, second.id, path)) >= 5);

    // Restore over a volume with stale content: identical, stale gone, root kept.
    await sh(dst, "echo stale > /d/stale.txt");
    await resticRestorePath(ctx, work, second.id, path, dst, { owner: "999:999", mode: "700" });
    assert.equal(await sh(dst, "sha256sum /d/big.bin | cut -c1-64"), await sh(src, "sha256sum /d/big.bin | cut -c1-64"));
    assert.equal(await sh(dst, "ls -A /d | sort | tr '\\n' ' '"), "big.bin link sub");
    assert.equal(await sh(dst, "stat -c '%u:%g %a' /d"), "999:999 700");
    assert.equal(await sh(dst, "readlink /d/link && cat /d/sub/b.txt"), "sub/a.txt\nmore");

    // A tar shaped like the tar engine's (entries under ./, root owner kept).
    const tarFile = join(work, "out.tar");
    await resticTarPath(ctx, work, second.id, path, tarFile, { owner: "999:999", mode: "700" });
    const listing = (await docker(["run", "--rm", "-v", `${work}:/w`, "alpine:3.24", "tar", "-tvf", "/w/out.tar"])).stdout;
    // (A macOS-shared work dir ignores chown; the agent's is a Linux volume.)
    assert.match(listing, process.platform === "darwin" ? /^drwx------ .* \.\/$/m : /^drwx------ 999\/\S+ .* \.\/$/m);
    assert.match(listing, /\.\/sub\/b\.txt$/m);

    // Exclusions: left out of the backup, kept on the target by a restore.
    const ex = ["/files", "*.bin"];
    const third = await resticBackupPath(ctx, work, src, path, ["snap:t1"], { excludes: ex });
    assert.equal(await resticCountPath(ctx, work, third.id, path), 4, "sub, sub/a.txt, sub/b.txt, link");
    await sh(dst, "mkdir -p /d/files && echo keep > /d/files/k.txt && echo keep > /d/kept.bin && echo stale > /d/stale.txt");
    await resticRestorePath(ctx, work, third.id, path, dst, { owner: "999:999", mode: "700" }, ex);
    assert.equal(await sh(dst, "cd /d && find . -type f | sort | tr '\\n' ' '"), "./big.bin ./files/k.txt ./kept.bin ./sub/a.txt ./sub/b.txt");

    // Bad references never reach a shell.
    await assert.rejects(resticRestorePath(ctx, work, "abc; rm -rf /", path, dst));
    await assert.rejects(resticCountPath(ctx, work, second.id, "/etc"));

    await resticForget(ctx, [first.id, second.id, third.id], false);
    assert.equal((await resticListSnapshotIds(ctx)).size, 0);
    await ctx.cleanup();
  } finally {
    setResticBin("restic");
    await docker(["volume", "rm", "-f", src, dst]).catch(() => undefined);
    await docker(["run", "--rm", "-v", `${dir}:${dir}`, "alpine:3.24", "rm", "-rf", join(dir, "dest"), work]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});
