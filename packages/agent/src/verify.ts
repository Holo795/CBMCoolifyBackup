import type { VerifyDestinationJob } from "@cbm/shared";
import { MANIFEST_FILE } from "@cbm/shared";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTransfer } from "./transfer.js";
import { resticListSnapshotIds, resticCheck, withResticCtx } from "./restic.js";
import { sha256File, decryptFile } from "./crypto.js";
import type { Emit } from "./backup.js";

type VerifyResult = { present: string[]; missing: string[]; corrupt: string[]; integrityError?: string };

/** One stored artifact as recorded in the manifest. */
type ManifestArtifact = { filename: string; sha256?: string; encrypted?: boolean };

/**
 * Reconcile a destination: check that each snapshot's files are still present
 * (catches backups deleted directly at the destination). When `deep` is set it
 * also verifies integrity, catching *silent corruption*:
 *  - restic: `restic check` (+ optional `--read-data-subset`).
 *  - tar: re-download each artifact; an encrypted one must decrypt cleanly (its
 *    AES-GCM tag is the integrity proof), a plaintext one must still match the
 *    sha256 recorded in the manifest.
 */
export async function runVerifyDestination(job: VerifyDestinationJob, emit: Emit): Promise<VerifyResult> {
  const present: string[] = [];
  const missing: string[] = [];
  const corrupt: string[] = [];

  if (job.storage.engine === "restic") {
    const ids = job.resticSnapshotIds ?? [];
    if (!job.storage.resticPassword) throw new Error("restic verify requires the repository password");
    return withResticCtx(job.destination, job.storage.resticPassword, async (ctx) => {
      // Presence: which expected snapshot ids still exist.
      if (ids.length) {
        emit("info", `Checking ${ids.length} restic snapshot(s)`, 20);
        const repo = await resticListSnapshotIds(ctx);
        for (const id of ids) (repo.has(id) ? present : missing).push(id);
      }
      let integrityError: string | undefined;
      if (job.deep) {
        // Repo-level integrity (not attributable to a single snapshot).
        emit("info", job.readDataSubset ? `restic check (re-reading ${job.readDataSubset} of data)` : "restic check", 60);
        const r = await resticCheck(ctx, job.readDataSubset);
        if (!r.ok) integrityError = r.detail;
        emit(r.ok ? "info" : "error", `Integrity: ${r.ok ? "OK" : r.detail}`, 100);
      } else {
        emit("info", `Reconciliation done: ${present.length} present, ${missing.length} missing`, 100);
      }
      return { present, missing, corrupt, integrityError };
    });
  }

  if (job.dirs.length === 0) return { present, missing, corrupt };

  const transfer = await makeTransfer(job.destination);
  const work = job.deep ? await mkdtemp(join(tmpdir(), "cbm-verify-")) : "";
  try {
    let i = 0;
    for (const dir of job.dirs) {
      i++;
      emit("info", `Checking ${dir} (${i}/${job.dirs.length})`, Math.round((i / job.dirs.length) * 100));
      const files = await transfer.list(dir).catch(() => [] as string[]);
      const manifestRel = files.find((f) => f === `${dir}/${MANIFEST_FILE}` || f.endsWith(`/${MANIFEST_FILE}`));
      if (!manifestRel) {
        missing.push(dir);
        continue;
      }
      if (!job.deep) {
        present.push(dir);
        continue;
      }
      // Deep: pull the manifest, then verify each artifact it lists.
      try {
        const bad = await verifyTarSnapshot(dir, manifestRel, files, transfer, work, job.decryptionKey, emit);
        (bad ? corrupt : present).push(dir);
      } catch (e) {
        emit("warn", `Could not verify ${dir}: ${(e as Error).message}`);
        corrupt.push(dir);
      }
    }
    emit(
      "info",
      `Done: ${present.length} ok, ${missing.length} missing${job.deep ? `, ${corrupt.length} corrupt` : ""}`,
      100,
    );
    return { present, missing, corrupt };
  } finally {
    await transfer.close().catch(() => undefined);
    if (work) await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Verify every artifact of one tar snapshot. Returns true if any is corrupt. */
async function verifyTarSnapshot(
  dir: string,
  manifestRel: string,
  files: string[],
  transfer: Awaited<ReturnType<typeof makeTransfer>>,
  work: string,
  decryptionKey: string | undefined,
  emit: Emit,
): Promise<boolean> {
  const manifestLocal = join(work, "manifest.json");
  await transfer.get(manifestRel, manifestLocal);
  const manifest = JSON.parse(await readFile(manifestLocal, "utf8")) as { artifacts?: ManifestArtifact[] };
  const artifacts = manifest.artifacts ?? [];
  let corrupt = false;

  for (const a of artifacts) {
    // Match the stored file for this artifact by its filename under the dir.
    const rel = files.find((f) => f === `${dir}/${a.filename}` || f.endsWith(`/${a.filename}`));
    if (!rel) {
      emit("warn", `${dir}: artifact ${a.filename} is missing`);
      corrupt = true;
      continue;
    }
    const local = join(work, "artifact.bin");
    await transfer.get(rel, local);
    try {
      if (a.encrypted) {
        if (!decryptionKey) throw new Error("encrypted artifact but no decryption key provided");
        // Decrypting verifies the AES-GCM auth tag; a corrupt file throws here.
        await decryptFile(local, join(work, "artifact.dec"), decryptionKey);
        await rm(join(work, "artifact.dec"), { force: true }).catch(() => undefined);
      } else if (a.sha256) {
        const sha = await sha256File(local);
        if (sha !== a.sha256) throw new Error(`sha256 mismatch for ${a.filename}`);
      }
    } catch (e) {
      emit("error", `${dir}: ${a.filename} failed integrity: ${(e as Error).message}`);
      corrupt = true;
    } finally {
      await rm(local, { force: true }).catch(() => undefined);
    }
  }
  return corrupt;
}
