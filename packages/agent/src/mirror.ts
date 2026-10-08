import type { MirrorJob, SnapshotManifest, Artifact } from "@cbm/shared";
import { MANIFEST_FILE, RESTIC_PART_META, resticPartIds } from "@cbm/shared";
import { mkdtemp, rm, mkdir, writeFile, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { makeTransfer } from "./transfer.js";
import { withResticCtx, resticEnsureRepo, resticBackupDir, resticCopy, resticCopyContext, resticInitCopyTarget } from "./restic.js";
import { encryptFile, sha256File } from "./crypto.js";
import { stagePlaintext } from "./stage.js";
import type { Emit } from "./backup.js";

/**
 * Copy one snapshot from the source destination to the mirror destination as a
 * FIRST-CLASS snapshot under the target's own crypto. Between two restic
 * repositories, `restic copy` (see copyBetweenRepos). Otherwise "stage then
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
  // restic to restic: copy the snapshots themselves.
  if (job.sourceStorage.engine === "restic" && job.targetStorage.engine === "restic" && job.resticSnapshotId) {
    const copied = await copyBetweenRepos(job, workDir, emit);
    if (copied) return copied;
  }
  const stage = await mkdtemp(join(workDir, "mirror-"));
  try {
    emit("info", "Fetching the snapshot from the source destination", 15);
    const plainDir = await stagePlaintext(
      {
        source: job.source,
        storage: job.sourceStorage,
        manifest: job.manifest,
        dir: job.dir,
        resticSnapshotId: job.resticSnapshotId,
        decryptionKey: job.sourceEncryptionKey,
      },
      stage,
      workDir,
    );

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
      // A volume restic read in place is a plain tar in the copy: drop what
      // pointed at its own restic snapshot, and checksum the tar.
      const { [RESTIC_PART_META]: part, resticPath: _p, rootOwner: _o, rootMode: _m, ...meta } = a.meta ?? {};
      const sha256 = part ? await sha256File(src) : a.sha256;
      newArtifacts.push({ ...a, meta, sha256, filename, encrypted, sizeBytes });
    }
    const manifest: SnapshotManifest = { ...job.manifest, artifacts: newArtifacts, encrypted: !!targetKey };

    if (job.targetStorage.engine === "restic") {
      if (!job.targetStorage.resticPassword) throw new Error("mirror target (restic) needs the repository password");
      // restic stores plaintext (it encrypts the repo natively).
      manifest.encrypted = false;
      await writeFile(join(outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
      const id = await withResticCtx(job.target, job.targetStorage.resticPassword, async (ctx) => {
        await resticEnsureRepo(ctx);
        return resticBackupDir(ctx, outDir, [`mirror:${job.id}`, `res:${job.manifest.resource.coolifyUuid}`]);
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

/**
 * A mirror from one restic repository to another: `restic copy` of the
 * snapshot and its parts (each volume read in place). Only the blocks the
 * target lacks are read and sent - nothing goes to the agent host in
 * plaintext, no volume is turned into a .tar, and the copy stays a volume
 * snapshot that a restore reads incrementally. A target created here gets the
 * source's chunker parameters, so both repositories share their blocks.
 * Null when one restic process can't open both (see resticCopyContext): the
 * caller then stages the snapshot as before.
 */
async function copyBetweenRepos(
  job: MirrorJob,
  workDir: string,
  emit: Emit,
): Promise<{ resticSnapshotId: string; manifest: SnapshotManifest } | null> {
  const srcPassword = job.sourceStorage.resticPassword;
  const dstPassword = job.targetStorage.resticPassword;
  if (!srcPassword || !dstPassword) throw new Error("a restic mirror needs both repository passwords");
  const ctx = await resticCopyContext(job.source, srcPassword, job.target, dstPassword, workDir);
  if (!ctx) {
    emit("info", "The two repositories can't be opened by one restic process (two S3 accounts): copying through the agent host");
    return null;
  }
  try {
    emit("info", "Copying the snapshot between the restic repositories (restic copy)", 15);
    ctx.onLockWait = () => emit("info", "Waiting for the repository lock: another job is using this destination");
    if (await resticInitCopyTarget(ctx)) emit("info", "Created the mirror repository with the source's chunker parameters", 20);
    const ids = [job.resticSnapshotId!, ...resticPartIds(job.manifest)];
    const map = await resticCopy(ctx, ids);
    const missing = ids.filter((id) => !map.has(id));
    if (missing.length) throw new Error(`restic copy left out snapshot(s) ${missing.map((m) => m.slice(0, 8)).join(", ")}`);
    const artifacts: Artifact[] = (job.manifest.artifacts ?? []).map((a) => {
      const part = a.meta?.[RESTIC_PART_META];
      return part ? { ...a, meta: { ...a.meta, [RESTIC_PART_META]: map.get(part)! } } : a;
    });
    const resticSnapshotId = map.get(job.resticSnapshotId!)!;
    const manifest: SnapshotManifest = { ...job.manifest, artifacts, resticSnapshotId, encrypted: false };
    emit("info", `Mirror complete (restic copy of ${ids.length} snapshot(s))`, 100);
    return { resticSnapshotId, manifest };
  } finally {
    await ctx.cleanup();
  }
}

