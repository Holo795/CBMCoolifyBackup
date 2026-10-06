import { RESTIC_PART_META, type ResolvedDestination, type StorageSpec, type SnapshotManifest } from "@cbm/shared";
import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { makeTransfer } from "./transfer.js";
import { withResticCtx, resticRestoreById } from "./restic.js";
import { resticTarPath } from "./restic-helper.js";
import { decryptFile } from "./crypto.js";
import { assertFreeSpace } from "./disk.js";

/** Where a snapshot's artifacts live and how to read them back. */
export type StageSource = {
  source: ResolvedDestination;
  storage: StorageSpec;
  manifest: SnapshotManifest;
  /** tar: the snapshot directory. */
  dir?: string;
  /** restic: the snapshot id. */
  resticSnapshotId?: string;
  /** tar: base64 AES key for encrypted artifacts. */
  decryptionKey?: string;
};

/**
 * Pull every artifact of a snapshot back to PLAINTEXT, named by its base
 * filename (without `.enc`), into `<stage>/plain`; returns that directory.
 * restic restores natively; encrypted tar artifacts are decrypted with the key.
 * A volume restic read in place (its own restic snapshot) is turned into a tar
 * like the tar engine's (`parts: "tar"`, a mirror copy) or left out for the
 * caller to read straight from the repository (`parts: "skip"`, a drill).
 */
export async function stagePlaintext(
  src: StageSource,
  stage: string,
  workDir: string,
  parts: "tar" | "skip" = "tar",
): Promise<string> {
  const out = join(stage, "plain");
  await mkdir(out, { recursive: true });
  const all = src.manifest.artifacts ?? [];
  const isPart = (a: (typeof all)[number]) => !!a.meta?.[RESTIC_PART_META];
  // Downloaded + decrypted (or unpacked + tarred) copies coexist: room for twice
  // what's staged.
  const total = all.filter((a) => parts === "tar" || !isPart(a)).reduce((n, a) => n + (a.sizeBytes ?? 0), 0);
  await assertFreeSpace(stage, total * 2);

  if (src.storage.engine === "restic") {
    if (!src.resticSnapshotId) throw new Error("restic source needs the snapshot id");
    if (!src.storage.resticPassword) throw new Error("restic source needs the repository password");
    await withResticCtx(
      src.source,
      src.storage.resticPassword,
      async (ctx) => {
        const restored = await resticRestoreById(ctx, src.resticSnapshotId!, join(stage, "restic"));
        for (const a of all) {
          const base = a.filename.replace(/\.enc$/, "");
          const part = a.meta?.[RESTIC_PART_META];
          if (part) {
            if (parts === "skip") continue;
            if (!a.meta.resticPath) throw new Error(`${a.filename}: restic snapshot ${part} has no recorded path`);
            const root = a.meta.rootOwner && a.meta.rootMode ? { owner: a.meta.rootOwner, mode: a.meta.rootMode } : undefined;
            await resticTarPath(ctx, workDir, part, a.meta.resticPath, join(out, base), root);
            continue;
          }
          await copyFile(join(restored, base), join(out, base)).catch(async () => {
            // Some restic layouts keep the original (possibly .enc) name; fall back.
            await copyFile(join(restored, a.filename), join(out, base));
          });
        }
      },
      workDir,
    );
    return out;
  }

  if (!src.dir) throw new Error("tar source needs the snapshot directory");
  const transfer = await makeTransfer(src.source);
  try {
    const dl = join(stage, "dl");
    await mkdir(dl, { recursive: true });
    for (const a of src.manifest.artifacts ?? []) {
      const base = a.filename.replace(/\.enc$/, "");
      const local = join(dl, a.filename);
      await transfer.get(`${src.dir}/${a.filename}`, local);
      if (a.encrypted) {
        if (!src.decryptionKey) throw new Error("encrypted artifact but no decryption key provided");
        await decryptFile(local, join(out, base), src.decryptionKey);
      } else {
        await copyFile(local, join(out, base));
      }
    }
    return out;
  } finally {
    await transfer.close().catch(() => undefined);
  }
}
