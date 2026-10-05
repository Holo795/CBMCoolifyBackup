import type { MirrorJob, SnapshotManifest, Artifact } from "@cbm/shared";
import { MANIFEST_FILE } from "@cbm/shared";
import { mkdtemp, rm, mkdir, writeFile, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { makeTransfer } from "./transfer.js";
import { withResticCtx, resticEnsureRepo, resticBackupDir, resticRestoreById } from "./restic.js";
import { encryptFile, decryptFile } from "./crypto.js";
import type { Emit } from "./backup.js";

/**
 * Copy one snapshot from the source destination to the mirror destination as a
 * FIRST-CLASS snapshot under the target's own crypto. Uniform "stage then
 * store": pull the snapshot's artifacts back to plaintext (restic restores
 * natively; encrypted tar is decrypted with the source key), then store them in
 * the target's engine (restic encrypts natively; tar re-encrypts with the target
 * key) and rebuild the manifest to match. Returns the new restic snapshot id
 * (restic target) and the rebuilt manifest for the controller to record.
 */
export async function runMirror(
  job: MirrorJob,
  workDir: string,
  emit: Emit,
): Promise<{ resticSnapshotId?: string; manifest: SnapshotManifest }> {
  const stage = await mkdtemp(join(workDir, "mirror-"));
  try {
    emit("info", "Fetching the snapshot from the source destination", 15);
    const plainDir = await stagePlaintext(job, stage);

    // Rebuild the manifest + files under the TARGET's crypto.
    const targetKey = job.targetStorage.engine === "restic" ? undefined : job.targetEncryptionKey;
    const outDir = join(stage, "out");
    await mkdir(outDir, { recursive: true });
    emit("info", "Re-packaging the copy for the mirror destination", 55);
    const newArtifacts: Artifact[] = [];
    for (const a of job.manifest.artifacts ?? []) {
      const base = a.filename.replace(/\.enc$/, "");
      const src = join(plainDir, base);
      let filename = base;
      let encrypted = false;
      if (targetKey) {
        filename = `${base}.enc`;
        encrypted = true;
        await encryptFile(src, join(outDir, filename), targetKey);
      } else {
        await copyFile(src, join(outDir, filename));
      }
      const sizeBytes = (await stat(join(outDir, filename))).size;
      newArtifacts.push({ ...a, filename, encrypted, sizeBytes });
    }
    const manifest: SnapshotManifest = { ...job.manifest, artifacts: newArtifacts, encrypted: !!targetKey };

    if (job.targetStorage.engine === "restic") {
      if (!job.targetStorage.resticPassword) throw new Error("mirror target (restic) needs the repository password");
      // restic stores plaintext (it encrypts the repo natively).
      manifest.encrypted = false;
      await writeFile(join(outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
      const id = await withResticCtx(job.target, job.targetStorage.resticPassword, async (ctx) => {
        await resticEnsureRepo(ctx);
        return resticBackupDir(ctx, outDir, [`mirror:${job.id}`]);
      });
      manifest.resticSnapshotId = id;
      emit("info", "Mirror complete (restic)", 100);
      return { resticSnapshotId: id, manifest };
    }

    if (!job.dir) throw new Error("mirror target (tar) needs the snapshot directory");
    await writeFile(join(outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
    const transfer = await makeTransfer(job.target);
    try {
      await transfer.put(join(outDir, MANIFEST_FILE), `${job.dir}/${MANIFEST_FILE}`);
      for (const a of newArtifacts) await transfer.put(join(outDir, a.filename), `${job.dir}/${a.filename}`);
    } finally {
      await transfer.close().catch(() => undefined);
    }
    emit("info", "Mirror complete (tar)", 100);
    return { manifest };
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Pull every artifact of the source snapshot back to PLAINTEXT, named by its
 * base filename, into a local directory; returns that directory. */
async function stagePlaintext(job: MirrorJob, stage: string): Promise<string> {
  const out = join(stage, "plain");
  await mkdir(out, { recursive: true });

  if (job.sourceStorage.engine === "restic") {
    if (!job.resticSnapshotId) throw new Error("mirror source (restic) needs the snapshot id");
    if (!job.sourceStorage.resticPassword) throw new Error("mirror source (restic) needs the repository password");
    // restic restores plaintext files (base names) into a recreated tree.
    const restored = await withResticCtx(job.source, job.sourceStorage.resticPassword, (ctx) =>
      resticRestoreById(ctx, job.resticSnapshotId!, join(stage, "restic")),
    );
    for (const a of job.manifest.artifacts ?? []) {
      const base = a.filename.replace(/\.enc$/, "");
      await copyFile(join(restored, base), join(out, base)).catch(async () => {
        // Some restic layouts keep the original (possibly .enc) name; fall back.
        await copyFile(join(restored, a.filename), join(out, base));
      });
    }
    return out;
  }

  if (!job.dir) throw new Error("mirror source (tar) needs the snapshot directory");
  const transfer = await makeTransfer(job.source);
  try {
    const dl = join(stage, "dl");
    await mkdir(dl, { recursive: true });
    for (const a of job.manifest.artifacts ?? []) {
      const base = a.filename.replace(/\.enc$/, "");
      const local = join(dl, a.filename);
      await transfer.get(`${job.dir}/${a.filename}`, local);
      if (a.encrypted) {
        if (!job.sourceEncryptionKey) throw new Error("encrypted source artifact but no source key provided");
        await decryptFile(local, join(out, base), job.sourceEncryptionKey);
      } else {
        await copyFile(local, join(out, base));
      }
    }
    return out;
  } finally {
    await transfer.close().catch(() => undefined);
  }
}
