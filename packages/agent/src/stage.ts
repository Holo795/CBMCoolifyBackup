import type { ResolvedDestination, StorageSpec, SnapshotManifest } from "@cbm/shared";
import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { makeTransfer } from "./transfer.js";
import { withResticCtx, resticRestoreById } from "./restic.js";
import { decryptFile } from "./crypto.js";

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
 */
export async function stagePlaintext(src: StageSource, stage: string): Promise<string> {
  const out = join(stage, "plain");
  await mkdir(out, { recursive: true });

  if (src.storage.engine === "restic") {
    if (!src.resticSnapshotId) throw new Error("restic source needs the snapshot id");
    if (!src.storage.resticPassword) throw new Error("restic source needs the repository password");
    const restored = await withResticCtx(src.source, src.storage.resticPassword, (ctx) =>
      resticRestoreById(ctx, src.resticSnapshotId!, join(stage, "restic")),
    );
    for (const a of src.manifest.artifacts ?? []) {
      const base = a.filename.replace(/\.enc$/, "");
      await copyFile(join(restored, base), join(out, base)).catch(async () => {
        // Some restic layouts keep the original (possibly .enc) name; fall back.
        await copyFile(join(restored, a.filename), join(out, base));
      });
    }
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
