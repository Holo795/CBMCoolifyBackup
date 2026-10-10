import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { RESTIC_PART_META, type Artifact, type RestoreJob, type ResourceType, type DbCredentials, withDumpCredentials } from "@cbm/shared";
import { accessDenied, restoreDatabaseAnyway } from "./dump.js";
import {
  restoreVolume,
  restoreToPath,
  restoreFileToPath,
  restoreRdbIntoVolume,
  stopContainer,
  startContainer,
  containerExists,
  docker,
} from "./docker.js";
import { unsafeRestorePath } from "./paths.js";
import { REDIS_ENGINES, type Engine } from "./engines.js";
import { decryptFile } from "./crypto.js";
import { makeTransfer } from "./transfer.js";
import { resticRestoreById, withResticCtx } from "./restic.js";
import { partKind, resticRestorePath } from "./restic-helper.js";
import { resolveResource, readDbCredentials, readDbLogins, resourceContainers, uniqueLogins } from "./resolve.js";
import type { Emit } from "./backup.js";
import { artifactExcludes } from "./excludes.js";

export async function runRestore(job: RestoreJob, workDir: string, emit: Emit): Promise<void> {
  const stage = join(workDir, job.id);
  await mkdir(stage, { recursive: true });
  const { manifest } = job;
  // Only the tar engine needs a destination transfer; restic pulls from its repo.
  const transfer = job.storage.engine === "restic" ? null : await makeTransfer(job.source);

  emit("info", `Restoring ${manifest.resource.name} [${manifest.resource.type}] from ${manifest.destinationDir}`, 2);
  // Host folders refused at restore time (see paths.ts); the rest still restores.
  const refusedFolders: string[] = [];

  try {
    // Materialise every artifact into a local directory (keyed by filename).
    const localFiles: Record<string, string> = {};
    if (job.storage.engine === "restic") {
      if (!job.storage.resticPassword || !job.resticSnapshotId) {
        throw new Error("restic restore requires the repository password and a snapshot id");
      }
      emit("info", `Fetching restic snapshot ${job.resticSnapshotId}`, 20);
      const dir = await withResticCtx(job.source, job.storage.resticPassword, (ctx) =>
        resticRestoreById(ctx, job.resticSnapshotId!, join(stage, "restic")),
      );
      for (const a of manifest.artifacts) {
        // restic repos are encrypted natively, so artifacts are never AES-wrapped.
        if (a.encrypted) throw new Error(`Encrypted artifact ${a.filename} in a restic snapshot is unexpected`);
        // Volumes read in place live in their own snapshot (restored below).
        if (!a.meta[RESTIC_PART_META]) localFiles[a.filename] = join(dir, a.filename);
      }
    } else {
      let i = 0;
      for (const a of manifest.artifacts) {
        i++;
        emit("info", `Fetching ${a.filename} (${i}/${manifest.artifacts.length})`, 5 + (35 * i) / manifest.artifacts.length);
        const dl = join(stage, a.filename);
        await transfer!.get(`${manifest.destinationDir}/${a.filename}`, dl);
        let usable = dl;
        if (a.encrypted) {
          if (!job.decryptionKey) throw new Error("Artifact is encrypted but no decryption key provided");
          usable = join(stage, a.filename.replace(/\.enc$/, ""));
          await decryptFile(dl, usable, job.decryptionKey);
        }
        localFiles[a.filename] = usable;
      }
    }

    // A load with the first login the database accepts (see readDbLogins): a
    // refused one is rejected before anything is written, so the next is tried.
    const restoreWithLogins = async (engine: ResourceType, container: string, logins: DbCredentials[], file: string) => {
      for (const [i, creds] of logins.entries()) {
        try {
          const client = await restoreDatabaseAnyway(engine, container, creds, file);
          if (client) emit("info", `${container} has no ${engine} client tools: restored with ${client}`);
          return;
        } catch (e) {
          if (!logins[i + 1] || !accessDenied(e)) throw e;
          emit("info", `A login was refused by ${container}: trying the next one`);
        }
      }
    };

    // A volume restic read in place is its own restic snapshot: restored straight
    // into the target (no local copy), with its root folder's owner and mode.
    const putVolume = async (v: Artifact, target: string, isHostPath: boolean) => {
      const part = v.meta[RESTIC_PART_META];
      // Paths the backup left out stay as they are on the target.
      const excludes = artifactExcludes(manifest.excludes, v.meta);
      if (!part) {
        await (isHostPath && v.meta.bindKind === "file"
          ? restoreFileToPath(target, localFiles[v.filename])
          : isHostPath
            ? restoreToPath(target, localFiles[v.filename], excludes)
            : restoreVolume(target, localFiles[v.filename], excludes));
        return;
      }
      if (!v.meta.resticPath) throw new Error(`${v.filename}: restic snapshot ${part} has no recorded path`);
      if (!isHostPath) await docker(["volume", "create", target]);
      const root = v.meta.rootOwner && v.meta.rootMode ? { owner: v.meta.rootOwner, mode: v.meta.rootMode } : undefined;
      await withResticCtx(
        job.source,
        job.storage.resticPassword!,
        async (ctx) =>
          resticRestorePath(ctx, workDir, part, v.meta.resticPath!, target, root, excludes, await partKind(ctx, workDir, part, v.meta)),
        workDir,
      );
    };

    const allDumps = manifest.artifacts.filter((a) => a.kind === "db-dump");
    const volumes = manifest.artifacts.filter((a) => a.kind === "volume");
    // SQL/Mongo logical dumps. Standalone ones (no meta.container) load into the
    // resolved primary; service-internal ones (meta.container set) load into
    // that specific container, in-place only.
    const dumps = allDumps.filter((a) => !REDIS_ENGINES.includes((a.meta.engine ?? "") as Engine));
    const standaloneDumps = dumps.filter((a) => !a.meta.container);
    const serviceDumps = dumps.filter((a) => a.meta.container);
    // Redis-family RDB snapshots: written into the data volume, loaded on start.
    const redisDumps = allDumps.filter((a) => REDIS_ENGINES.includes((a.meta.engine ?? "") as Engine));

    // Where to restore INTO: for "→ new" the freshly-cloned Coolify resource
    // (resolved from its uuid on the live host), else the original. The clone
    // keeps the same DB name + credentials, so the dump loads as-is, and the
    // original is never touched in new mode.
    const isNew = job.target === "new_resource";
    const into = isNew && job.targetResource ? job.targetResource : manifest.resource;
    if (isNew && !job.targetResource) {
      throw new Error("Restore → new resource: the controller provided no cloned target");
    }

    // Standalone logical dumps (DB resources + coolify-self): load into the
    // resolved primary container. Works in both modes (the clone keeps the same
    // DB name + creds).
    if (standaloneDumps.length > 0) {
      // Re-resolve container + credentials from the live Docker host (manifest
      // intentionally carries no secrets).
      const resolved = await resolveResource(into);
      const container = resolved.containerName ?? into.containerName ?? job.targetContainerName;
      if (!container) throw new Error(`DB restore requires a target container (resolving ${into.name})`);
      // Prefer the controller-provided creds (authoritative, from the Coolify
      // API) over whatever was read from the container env.
      const logins = job.dumpCredentials
        ? [withDumpCredentials(job.db ?? resolved.db, job.dumpCredentials) ?? {}]
        : uniqueLogins([job.db ?? resolved.db ?? {}, ...(await readDbLogins(container, into.type).catch(() => []))]);
      for (const d of standaloneDumps) {
        const engine = ((d.meta.engine as ResourceType) || into.type) as ResourceType;
        emit("info", `Restoring dump ${d.filename} into ${into.name} (${container})`, 50);
        await restoreWithLogins(engine, container, logins, localFiles[d.filename]);
      }
    }

    // Volumes (+ Redis RDB snapshots written into their data volume).
    if (isNew) {
      // → new: the clone isn't deployed, so just pre-fill its (uuid-swapped)
      // volumes. Never touch the original resource's containers/volumes.
      for (const v of volumes) {
        if (v.meta.bindSource) {
          emit("warn", `Host folder "${v.meta.bindSource}" not restored to the clone - restore it manually if needed`);
          continue;
        }
        const src = v.meta.volume;
        const dest = src ? job.volumeMap?.[src] : undefined;
        if (!dest) {
          emit("warn", `No clone volume mapping for "${src ?? v.filename}" - skipping (restore it manually after deploy)`);
          continue;
        }
        emit("info", `Restoring volume ${src} → ${dest}`, 70);
        await putVolume(v, dest, false);
      }
      for (const d of redisDumps) {
        const dest = d.meta.volume ? job.volumeMap?.[d.meta.volume] : undefined;
        if (!dest) {
          emit("warn", `No clone volume mapping for the ${d.meta.engine} snapshot - skipping`);
          continue;
        }
        emit("info", `Restoring ${d.meta.engine} snapshot → ${dest}`, 72);
        await restoreRdbIntoVolume(dest, localFiles[d.filename]);
      }
    } else if (volumes.length > 0 || redisDumps.length > 0) {
      // in place: stop the resource, overwrite its volumes / drop the RDB, restart.
      const containers = resourceContainers(manifest.resource);
      const stopped: string[] = [];
      let restored = false;
      try {
        for (const c of containers) {
          if (await containerExists(c)) {
            emit("info", `Stopping ${c} for restore`);
            await stopContainer(c);
            stopped.push(c);
          }
        }
        for (const v of volumes) {
          if (v.meta.bindSource) {
            // The folder is wiped then refilled: never a system or top-level path.
            const unsafe = unsafeRestorePath(v.meta.bindSource);
            if (unsafe) {
              emit("error", `Host folder ${v.meta.bindSource} NOT restored: it ${unsafe}`);
              refusedFolders.push(v.meta.bindSource);
              continue;
            }
            // Docker auto-creates a missing host path for the bind mount (fresh
            // machine after DR) — root-owned, so permissions may need review.
            emit("info", `Restoring host folder ${v.meta.bindSource} (created if missing)`, 70);
            await putVolume(v, v.meta.bindSource, true);
            continue;
          }
          const volName = v.meta.volume;
          if (!volName) {
            emit("warn", `Volume artifact ${v.filename} has no volume name; skipping`);
            continue;
          }
          emit("info", `Restoring volume ${volName}`, 70);
          await putVolume(v, volName, false);
        }
        for (const d of redisDumps) {
          if (!d.meta.volume) {
            emit("warn", `${d.meta.engine} snapshot has no target volume; skipping`);
            continue;
          }
          emit("info", `Restoring ${d.meta.engine} snapshot into ${d.meta.volume}`, 72);
          await restoreRdbIntoVolume(d.meta.volume, localFiles[d.filename]);
        }
        restored = true;
      } finally {
        if (restored && job.restart === false && stopped.length > 0) {
          // The controller redeploys them on the snapshot's image version: the
          // version they ran must not start on the restored data first.
          emit("info", `Leaving ${stopped.length} container(s) stopped: they are redeployed on the snapshot's version`);
          stopped.length = 0;
        }
        for (const c of stopped.reverse()) {
          emit("info", `Restarting ${c}`);
          await startContainer(c).catch((e) => emit("error", `Failed to restart ${c}: ${(e as Error).message}`));
        }
      }
    }

    // Service-internal logical dumps (in-place only): load each into its own
    // container after it's back up. Best-effort - the volume copy already
    // restored the data, so a failure here isn't fatal.
    if (!isNew && serviceDumps.length > 0 && job.restart === false) {
      emit("info", `${serviceDumps.length} service-internal database dump(s) not loaded: the containers are redeployed first, their volumes hold the data.`);
    } else if (!isNew && serviceDumps.length > 0) {
      for (const d of serviceDumps) {
        const container = d.meta.container as string;
        if (!(await containerExists(container))) {
          emit("warn", `Service DB container ${container} not found; skipping its dump`);
          continue;
        }
        const engine = d.meta.engine as ResourceType;
        const logins = job.dumpCredentials
          ? [withDumpCredentials(await readDbCredentials(container, engine), job.dumpCredentials) ?? {}]
          : await readDbLogins(container, engine);
        emit("info", `Loading ${engine} dump into ${container}`, 88);
        await restoreWithLogins(engine, container, logins, localFiles[d.filename]).catch((e) =>
          emit("error", `Service DB restore into ${container} failed: ${(e as Error).message}`),
        );
      }
    } else if (isNew && serviceDumps.length > 0) {
      emit("warn", `${serviceDumps.length} service-internal database dump(s) not applied to the clone - its volumes were restored instead.`);
    }

    // For a freshly-cloned app/service, remind the operator of the manual steps
    // we intentionally skip (no deploy, no domain).
    if (isNew && (into.type === "application" || into.type === "service")) {
      emit(
        "warn",
        `New ${into.type} "${into.name}" created but NOT deployed. In Coolify: set its environment variables and a ` +
          `domain/URL, then deploy. Restored volume data will be mounted on first deploy.`,
      );
    }

    if (manifest.provenance.gitCommitSha || manifest.provenance.imageDigest) {
      emit(
        "warn",
        `Code provenance recorded (commit=${manifest.provenance.gitCommitSha ?? "?"}, image=${manifest.provenance.imageDigest ?? "?"}). ` +
          `Re-pin the deployment in Coolify to match the restored data (controller handles this).`,
      );
    }

    if (refusedFolders.length > 0) {
      throw new Error(
        `Restored everything except ${refusedFolders.length} unsafe host folder(s): ${refusedFolders.join(", ")}`,
      );
    }
    emit("info", "Restore complete", 100);
  } finally {
    if (transfer) await transfer.close();
    await rm(stage, { recursive: true, force: true });
  }
}
