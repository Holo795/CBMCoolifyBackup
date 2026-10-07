import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  type Artifact,
  type BackupJob,
  type DiscoveredContainer,
  type Provenance,
  type SnapshotManifest,
  DUMPABLE_DB_TYPES,
  dumpFileName,
  volumeFileName,
  MANIFEST_FILE,
  CONFIG_FILE,
  CONFIG_ONLY_CAPTURE,
  RESTIC_PART_META,
} from "@cbm/shared";
import { dumpDatabase, dumpRedis } from "./dump.js";
import { REDIS_ENGINES, isRedisEngine, type Engine } from "./engines.js";
import {
  hostEntries,
  runningRwContainersForVolume,
  isContainerRunning,
  containerExists,
  containerWritableBytes,
  pathSizeBytes,
  rootStat,
  execShell,
  inspectContainer,
  type RunResult,
} from "./docker.js";
import { matchHookTargets, DEFAULT_HOOK_TIMEOUT_SEC } from "./hooks.js";
import { captureImages, captureProvenance } from "./provenance.js";
import { encryptFile, sha256File } from "./crypto.js";
import { makeTransfer, type Transfer } from "./transfer.js";
import { resticEnsureRepo, resticBackupDir, resticContext, resticForget, type ResticCtx } from "./restic.js";
import { resticBackupPath, snapshotPath, type PathBackup } from "./restic-helper.js";
import { resolveResource, findDbContainers, readDbCredentials, resourceContainers } from "./resolve.js";
import { assertFreeSpace, freeBytes, minFreeBytes } from "./disk.js";
import { getSettings } from "./settings.js";
import { chooseStaging, needsMeasure } from "./staging.js";
import { captureTar } from "./capture.js";
import { openFreezer, healthCheckOf, healthStatus } from "./freeze.js";
import { backupOutcome, unbackedLayerWarning, captureErrorWarning, configOnlyFailure } from "./outcome.js";

const mib = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GiB` : `${(n / 1024 ** 2).toFixed(1)} MiB`);

/** "12 new, 3 changed, 4 210 unchanged files - 1.2 MiB added" */
function describePass(b: PathBackup): string {
  return `${b.filesNew} new, ${b.filesChanged} changed, ${b.filesUnmodified} unchanged files - ${mib(b.added)} added`;
}

export type Emit = (level: "debug" | "info" | "warn" | "error", message: string, progress?: number) => void;

/** The image a container runs, recorded on dump artifacts so a restore drill can
 * load the dump into the exact same engine version. Best-effort: never fails a backup. */
async function imageMeta(container: string): Promise<Record<string, string>> {
  const image = (await inspectContainer(container).catch(() => null))?.Config?.Image;
  return image ? { image } : {};
}

/** Returned instead of a manifest when the resource has nothing on the host to
 * back up (no container, volume or data) - a clear "ignored" outcome. */
export type BackupSkipped = { skipped: true; reason: string };

/** Does any container of the resource exist on this host (running or not)? */
async function anyContainerExists(containers: string[]): Promise<boolean> {
  for (const c of containers) if (await containerExists(c)) return true;
  return false;
}

export async function runBackup(job: BackupJob, workDir: string, emit: Emit): Promise<SnapshotManifest | BackupSkipped> {
  try {
    return await backupInStage(job, workDir, emit);
  } catch (e) {
    // Whatever failed (even before the backup's own cleanup is in place), don't
    // leave its staging behind on the host.
    await rm(join(workDir, job.id), { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
}

async function backupInStage(job: BackupJob, workDir: string, emit: Emit): Promise<SnapshotManifest | BackupSkipped> {
  const stage = join(workDir, job.id);
  await mkdir(stage, { recursive: true });
  // The space kept free is a floor for any backup (dumps, the manifest…).
  await assertFreeSpace(stage);

  // Always resolve concrete docker facts from the UUID: it fills in what the
  // controller didn't cache (notably bind mounts, which aren't cached) and keeps
  // anything already provided.
  const resource = await resolveResource(job.resource);
  const liveBackup = job.liveBackup;
  const artifacts: Artifact[] = [];
  // Opened on first use: a volume sent straight to the destination needs it
  // before the end-of-backup upload.
  let transfer: Transfer | undefined;
  const transferFor = async () => (transfer ??= await makeTransfer(job.destination));
  // Artifacts already at the destination (sent without a local copy).
  const sentDirect = new Set<string>();
  // restic: opened on first use too, and the snapshots of volumes read in place,
  // dropped again if the backup fails.
  let restic: ResticCtx | undefined;
  const resticFor = async () => {
    if (restic) return restic;
    if (!job.storage.resticPassword) throw new Error("restic engine selected but no repository password provided");
    // Its ssh files go in the work dir (seen by helper containers), never in
    // the stage that becomes the snapshot.
    const ctx = await resticContext(job.destination, job.storage.resticPassword, workDir);
    restic = ctx;
    await resticEnsureRepo(ctx);
    return ctx;
  };
  const parts: string[] = [];
  let stored = false;
  const isDb = DUMPABLE_DB_TYPES.includes(resource.type);
  const containers = resourceContainers(resource);
  // What the agent actually did, recorded in the manifest for display.
  let captureMethod = "none";

  emit("info", `Starting ${job.mode} of ${resource.name} [${resource.type}]`, 2);
  if (job.excludes.length) emit("info", `Left out of volume copies: ${job.excludes.join(", ")}`);
  const captureWarning = captureErrorWarning(job.configCaptureError);
  if (captureWarning) emit("warn", captureWarning);

  // Provenance (best-effort) from the primary container.
  let provenance: Provenance = {};
  const primary = resource.containerName ?? containers[0];
  if (primary && (await containerExists(primary))) {
    try {
      provenance = await captureProvenance(primary);
      const running: string[] = [];
      for (const c of containers) if (await containerExists(c)) running.push(c);
      const images = await captureImages(running.length ? running : [primary]);
      if (images.length) provenance.images = images;
      emit("debug", `Provenance: ${JSON.stringify(provenance)}`);
    } catch (e) {
      emit("warn", `Provenance capture failed: ${(e as Error).message}`);
    }
  }

  const isCoolifySelf = resource.coolifyUuid.startsWith("coolify-self");
  const isRedisStandalone = REDIS_ENGINES.includes(resource.type as Engine);

  // Copy every named volume + host-path (bind) mount WITHOUT stopping a
  // container. The running containers that write to them are frozen ONCE for
  // all of them (unless liveBackup): one short cut per backup, not one per
  // volume. With restic reading volumes in place, a first pass runs before the
  // freeze and carries the bulk of the changes; the frozen pass then only reads
  // what moved in between. Returns the capture method.
  const copyVolumesAndBinds = async (): Promise<string> => {
    // Named volumes and host-path (bind) mounts are copied the same way; they
    // only differ in what to freeze and the artifact meta.
    type Target = {
      source: string;
      fileName: string;
      label: string;
      meta: Record<string, string>;
      /** Where restic keeps it when it reads it in place. */
      resticPath: () => string;
      freezeContainers: () => Promise<string[]>;
    };
    const targets: Target[] = [
      ...resource.volumes.map((vol) => ({
        source: vol,
        fileName: volumeFileName(vol),
        label: `volume ${vol}`,
        meta: { volume: vol },
        resticPath: () => snapshotPath("volume", vol),
        freezeContainers: () => runningRwContainersForVolume(vol),
      })),
      ...resource.bindMounts.map((b) => {
        const slug = b.source.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        return {
          source: b.source,
          fileName: volumeFileName("bind-" + slug),
          label: `host folder ${b.source}`,
          meta: { bindSource: b.source },
          resticPath: () => snapshotPath("bind", slug),
          freezeContainers: async () => ((await isContainerRunning(b.container)) ? [b.container] : []),
        };
      }),
    ];
    const total = targets.length;
    if (total === 0) return "none";
    if (job.encryption.enabled && !job.encryption.key) throw new Error("Encryption enabled but no key provided");

    // 1. Where each copy goes - before freezing anything: never pause an app
    //    only to fail on a full disk.
    const { stagingMode } = getSettings();
    const plans: Array<{ t: Target; choice: Exclude<ReturnType<typeof chooseStaging>, { error: string }>; needBytes: number | null }> = [];
    for (const t of targets) {
      const measure = needsMeasure(stagingMode, job.storage.engine);
      const needBytes = measure ? await pathSizeBytes(t.source) : null;
      const choice = chooseStaging({
        mode: stagingMode,
        engine: job.storage.engine,
        label: t.label,
        needBytes,
        freeBytes: measure ? await freeBytes(stage) : null,
        minFreeBytes: minFreeBytes(),
      });
      if ("error" in choice) throw new Error(choice.error);
      plans.push({ t, choice, needBytes });
    }

    // 2. Every container writing to any of them, frozen once below.
    const owners = liveBackup ? [] : [...new Set((await Promise.all(targets.map((t) => t.freezeContainers()))).flat())];
    for (const { t, choice } of plans) {
      if (choice.where === "direct") {
        emit(
          choice.because === "no-room" ? "warn" : "info",
          `${choice.because === "no-room" ? "Not enough room on the agent host" : "Copy mode is direct"}: ` +
            `sending ${t.label} straight to the destination` +
            (owners.length ? ` - the freeze lasts until its upload ends` : ""),
        );
      }
    }

    // 3. restic: a first pass without freezing (only worth it when freezing).
    const tags = [`snap:${job.id}`, `res:${resource.coolifyUuid}`, "part:volume"];
    const warm = new Map<Target, string>();
    const roots = new Map<Target, Awaited<ReturnType<typeof rootStat>>>();
    for (const [n, { t, choice }] of plans.entries()) {
      if (choice.where !== "repository") continue;
      roots.set(t, await rootStat(t.source));
      if (!owners.length) continue;
      emit("info", `Reading ${t.label} into the restic repository before freezing (${n + 1}/${total})`, 20 + (25 * (n + 1)) / total);
      const w = await resticBackupPath(await resticFor(), workDir, t.source, t.resticPath(), [...tags, "pass:warm"], { excludes: job.excludes });
      warm.set(t, w.id);
      parts.push(w.id);
      emit("info", `First pass on ${t.label}: ${describePass(w)}`);
    }

    // 4. One freeze for all of them.
    const freezer = owners.length ? await openFreezer(getSettings().freezeMethod, (m) => emit("warn", m)) : null;
    const health = new Map<string, Awaited<ReturnType<typeof healthCheckOf>>>();
    for (const c of owners) {
      const hc = await healthCheckOf(c);
      if (!hc) continue;
      health.set(c, hc);
      if (freezer?.method === "pause") {
        emit(
          "warn",
          `${c} has a health check every ${hc.intervalS}s: docker pause makes Docker report it unhealthy while frozen ` +
            `and until its next check, so Coolify's proxy may not route to it for up to ~${hc.intervalS}s. ` +
            `Set the agent's freeze method to "cgroup" (or shorten the check interval) to avoid it.`,
        );
      }
    }
    let frozenAt = 0;
    try {
      if (freezer) {
        emit("info", `Freezing ${owners.join(", ")} once for a consistent copy of ${total} volume(s)/folder(s) (${freezer.method})`, 50);
        await freezer.freeze(owners);
        frozenAt = Date.now();
      }
      if (liveBackup) emit("warn", `Live copy without freezing (at your own risk) - may be inconsistent`);
      for (const [n, { t, choice, needBytes }] of plans.entries()) {
        const progress = 50 + (20 * (n + 1)) / total;
        if (choice.where === "repository") {
          const path = t.resticPath();
          emit("info", owners.length ? `Final pass on ${t.label} while frozen` : `Backing up ${t.label} with restic (${n + 1}/${total})`, progress);
          // Frozen: wait for another command's lock a minute at most, never longer.
          const b = await resticBackupPath(await resticFor(), workDir, t.source, path, tags, {
            lockWait: owners.length ? "1m" : undefined,
            excludes: job.excludes,
          });
          parts.push(b.id);
          emit("info", `${owners.length ? "Final pass on " : ""}${t.label}: ${describePass(b)}`);
          const root = roots.get(t);
          artifacts.push({
            kind: "volume",
            filename: t.fileName,
            sizeBytes: b.bytes,
            encrypted: false,
            meta: {
              ...t.meta,
              [RESTIC_PART_META]: b.id,
              resticPath: path,
              ...(root ? { rootOwner: root.owner, rootMode: root.mode } : {}),
            },
          });
          continue;
        }
        const filename = job.encryption.enabled ? `${t.fileName}.enc` : t.fileName;
        emit("info", `Archiving ${t.label} (${n + 1}/${total})`, progress);
        // One pass: tar -> read-back check -> sha256 -> (encrypt) -> local file or
        // the destination. An encrypted copy no longer needs twice the room.
        const target = choice.where === "local" ? join(stage, filename) : `${job.destinationDir}/${filename}`;
        const sink =
          choice.where === "local"
            ? (body: Readable) => pipeline(body, createWriteStream(target))
            : async (body: Readable) => (await transferFor()).putStream(body, target, needBytes ?? undefined);
        const res = await captureTar(t.source, sink, job.encryption.enabled ? job.encryption.key : undefined, job.excludes);
        artifacts.push({
          kind: "volume",
          filename,
          sizeBytes: res.storedBytes,
          sha256: res.sha256,
          encrypted: job.encryption.enabled,
          meta: t.meta,
        });
        if (choice.where === "direct") sentDirect.add(filename);
      }
    } finally {
      if (freezer) {
        const failed = frozenAt ? await freezer.thaw(owners) : [];
        if (frozenAt) emit("info", `Resumed ${owners.join(", ")} - frozen ${((Date.now() - frozenAt) / 1000).toFixed(1)}s`, 72);
        for (const c of failed) emit("error", `Failed to resume ${c} - the agent retries at its next start`);
        await freezer.close();
      }
    }
    // How long a health-checked container took to be reported healthy again
    // (followed in the background; the backup waits for it before finishing).
    for (const [c, hc] of health) if (hc && frozenAt) healthWatches.push(watchHealth(c, hc, Date.now()));

    // 5. The first-pass snapshots: their data lives on in the final ones.
    if (warm.size) {
      const ctx = await resticFor();
      const ids = [...warm.values()];
      await resticForget(ctx, ids, false).catch((e) => emit("warn", `Could not drop the first-pass snapshots: ${(e as Error).message}`));
      for (const id of ids) parts.splice(parts.indexOf(id), 1);
    }
    return liveBackup ? "live" : "frozen";
  };

  // Follow a container's health after a freeze, and say how long it took.
  const healthWatches: Promise<void>[] = [];
  const watchHealth = async (c: string, hc: NonNullable<Awaited<ReturnType<typeof healthCheckOf>>>, since: number) => {
    const deadline = since + (hc.intervalS + hc.timeoutS + 10) * 1000;
    for (;;) {
      const st = await healthStatus(c);
      if (st === "healthy") {
        const s = (Date.now() - since) / 1000;
        if (s >= 2) emit("warn", `${c} was reported healthy again ${s.toFixed(0)}s after the freeze`);
        return;
      }
      if (st == null || Date.now() > deadline) {
        emit("warn", `${c} not reported healthy ${hc.intervalS + hc.timeoutS + 10}s after the freeze (status: ${st ?? "unknown"})`);
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  // Logical dump of one DB container (SQL via pg_dump/mysqldump/…, Redis via an
  // RDB export). Returns the artifact, or null if it couldn't be produced.
  const dumpContainer = async (
    container: string,
    engine: Engine,
    meta: Record<string, string>,
    progress: number,
  ): Promise<Artifact | null> => {
    try {
      if (isRedisEngine(engine)) {
        const creds = await readDbCredentials(container, engine);
        const name = `dump-${engine}-${container}.rdb`.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = join(stage, name);
        emit("info", `Exporting ${engine} (${container}) via RDB - no freeze`, progress);
        await dumpRedis(container, creds?.password, path);
        const rdbMeta = { engine, container, ...meta, ...(await imageMeta(container)) };
        return await finalizeArtifact("db-dump", name, path, rdbMeta, job, stage, emit);
      }
      const creds = await readDbCredentials(container, engine);
      const name = `dump-${engine}-${container}.sql`.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = join(stage, name);
      emit("info", `Dumping ${engine} (${container}) - no downtime`, progress);
      await dumpDatabase(engine, container, creds ?? {}, path);
      const sqlMeta = { engine, container, ...meta, ...(await imageMeta(container)) };
      return await finalizeArtifact("db-dump", name, path, sqlMeta, job, stage, emit);
    } catch (e) {
      emit("warn", `Logical export of ${container} (${engine}) failed: ${(e as Error).message}`);
      return null;
    }
  };

  // Hook targets: "" → the primary container; otherwise a compose service name
  // (stable across redeploys) or an exact container name of THIS resource. The
  // service labels are read once. A target that matches nothing is skipped -
  // never redirected to another container.
  const hooks = job.hooks ?? [];
  const hookInventory: DiscoveredContainer[] = hooks.length
    ? await Promise.all(
        containers.map(async (name) => {
          const service = (await inspectContainer(name).catch(() => null))?.Config?.Labels?.["com.docker.compose.service"];
          return service ? { name, service } : { name };
        }),
      )
    : [];
  const runHook = async (when: "pre" | "post", target: string, cmd: string, timeoutSec?: number, progress?: number) => {
    const targets = matchHookTargets(target, hookInventory, primary);
    if (targets.length === 0) {
      emit("warn", `No container of this resource matches the ${when}-backup hook target "${target || "primary"}"; skipped`);
      return;
    }
    const limit = timeoutSec ?? DEFAULT_HOOK_TIMEOUT_SEC;
    for (const c of targets) {
      emit("info", `Running ${when}-backup hook in ${c}`, progress);
      const r = await execShell(c, cmd, limit).catch(
        (e): RunResult => ({ code: -1, stdout: "", stderr: (e as Error).message }),
      );
      if (r.code === 0) continue;
      const why = r.timedOut || r.code === 124 ? `timed out after ${limit}s` : `exit ${r.code}`;
      const msg = `${when}-backup hook failed in ${c} (${why}): ${r.stderr.trim().slice(0, 300)}`;
      if (when === "pre") throw new Error(msg);
      emit("warn", msg);
    }
  };

  try {
  // Pre-backup hooks: run inside their container(s); a failure or timeout aborts
  // the backup (the operator wanted the app quiesced first). They run INSIDE the
  // try so the post hooks (finally below) still run to undo them - e.g. bring an
  // app back out of maintenance even when a pre hook or the backup failed.
  for (const h of hooks) {
    if (h.pre) await runHook("pre", h.container, h.pre, h.timeoutSec, 5);
  }

  if (isCoolifySelf) {
    // Coolify control plane: logical dump of its Postgres + live tar of /data/coolify.
    if (!primary) throw new Error("Coolify self-backup could not locate the Coolify database container");
    emit("info", `Dumping Coolify database`, 20);
    const dumpName = dumpFileName("postgresql", resource.db?.database);
    const dumpPath = join(stage, dumpName);
    await dumpDatabase("postgresql", primary, resource.db ?? {}, dumpPath);
    artifacts.push(await finalizeArtifact("db-dump", dumpName, dumpPath, { engine: "postgresql" }, job, stage, emit));
    // Its files on the host (read live: nothing to freeze). The APP_KEY in
    // source/.env is what makes the database's secrets readable again on a new
    // Coolify: without it the copy can't rebuild the control plane, so fail
    // loudly (an alert) rather than store a useless snapshot.
    const folders = resource.bindMounts.map((b) => b.source);
    const sourceDir = folders.find((f) => f.endsWith("/source"));
    if (!sourceDir || !(await hostEntries(sourceDir, [".env"], "-f")).length) {
      throw new Error(
        `Coolify's .env (with its APP_KEY) wasn't found${sourceDir ? ` in ${sourceDir}` : " (no source folder next to its data)"}: ` +
          `a control-plane copy without it can't decrypt Coolify's secrets after a restore.`,
      );
    }
    emit("info", `Coolify files: ${[...folders, ...resource.volumes.map((v) => `volume ${v}`)].join(", ")}`, 30);
    await copyVolumesAndBinds();
    captureMethod = "dump+live";
  } else if (isDb) {
    // Standalone database: a logical dump while running - no downtime, no
    // restart, application-consistent. If it isn't deployed (no running
    // container), there's nothing on the host to dump - fall through to the
    // "nothing to back up" check below rather than failing.
    if (primary && (await containerExists(primary))) {
      emit("info", `Dumping database via ${resource.type} (no downtime)`, 20);
      const engine = resource.type;
      const dumpName = dumpFileName(engine, resource.db?.database);
      const dumpPath = join(stage, dumpName);
      await dumpDatabase(resource.type, primary, resource.db ?? {}, dumpPath);
      const dumpMeta = { engine, ...(await imageMeta(primary)) };
      artifacts.push(await finalizeArtifact("db-dump", dumpName, dumpPath, dumpMeta, job, stage, emit));
      captureMethod = "dump";
    } else {
      emit("warn", `${resource.type} has no running container - nothing to dump`);
    }
  } else if (isRedisStandalone) {
    // Standalone Redis/KeyDB/Dragonfly: prefer a logical RDB export (no freeze,
    // portable). Fall back to a frozen volume copy if the CLI isn't available.
    const dataVolume = resource.volumes[0] ?? "";
    const art =
      primary && (await containerExists(primary))
        ? await dumpContainer(primary, resource.type as Engine, { volume: dataVolume }, 20)
        : null;
    if (art) {
      artifacts.push(art);
      captureMethod = "dump";
    } else {
      emit("warn", `Falling back to a frozen volume copy for ${resource.type}`);
      captureMethod = await copyVolumesAndBinds();
    }
  } else {
    // Apps & services: capture every volume + bind mount (no restart), AND give
    // any database living inside the resource (e.g. the Postgres in a compose
    // service) a logical export on top - application-consistent and restorable
    // across engine versions. The volume copy is kept so "→ new" still works.
    const dbs = await findDbContainers(containers);
    let dumped = 0;
    for (const db of dbs) {
      const art = await dumpContainer(db.container, db.engine, { volume: db.volumes[0] ?? "" }, 15);
      if (art) {
        artifacts.push(art);
        dumped++;
      }
    }
    const volMethod = await copyVolumesAndBinds();
    captureMethod = dumped > 0 ? `dump+${volMethod}` : volMethod;
  }

  // Nothing captured: either the resource doesn't exist on this host (skip it
  // with a clear "ignored" status rather than an empty snapshot or a failure),
  // or it runs without any volume, bind mount or database - then keep its
  // configuration (image/commit, environment) so it can be recreated.
  const outcome = backupOutcome(artifacts.length, await anyContainerExists(containers));
  if (outcome === "skip") {
    emit("warn", "Nothing to back up on the host (no container, volume or data) - ignored");
    return { skipped: true, reason: "Ignored: nothing on the host (no container, volume or data)" };
  }
  const failure = configOnlyFailure(outcome, job.configCaptureError);
  if (failure) throw new Error(failure);
  if (outcome === "config") {
    captureMethod = CONFIG_ONLY_CAPTURE;
    emit("info", "No volume, bind mount or database: keeping the configuration only (image or commit, environment)", 70);
    for (const c of containers) {
      const warning = unbackedLayerWarning(c, await containerWritableBytes(c));
      if (warning) emit("warn", warning);
    }
  }

  // DB credentials never leave the host: not in the manifest (stored unencrypted)
  // nor in the config artifact (plaintext on an unencrypted tar destination).
  // Restores re-resolve them from the live container / the controller.
  const { db: _omitDb, ...sanitizedResource } = resource;

  // Config artifact (resource descriptor + provenance), encrypted if enabled.
  const config = { resource: sanitizedResource, provenance };
  const configPath = join(stage, CONFIG_FILE);
  await writeFile(configPath, JSON.stringify(config, null, 2));
  artifacts.push(await finalizeArtifact("config", CONFIG_FILE, configPath, {}, job, stage, emit));

  const manifest: SnapshotManifest = {
    version: 1,
    resource: sanitizedResource,
    mode: job.mode,
    captureMode: captureMethod,
    capturedAt: new Date().toISOString(),
    artifacts,
    provenance,
    envEnc: job.envEnc,
    capturedConfig: job.capturedConfig,
    encrypted: job.encryption.enabled,
    destinationDir: job.destinationDir,
    ...(job.excludes.length ? { excludes: job.excludes } : {}),
  };

  // Persist the manifest into the staging dir (it's part of what gets stored).
  const manifestPath = join(stage, MANIFEST_FILE);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  if (job.storage.engine === "restic") {
    // Incremental, deduplicated, encrypted: restic backs up the whole staging
    // dir; only changed blocks are uploaded. The repo encrypts at rest.
    emit("info", "Storing in restic repository (incremental)", 80);
    const ctx = await resticFor();
    const snapId = await resticBackupDir(ctx, stage, [`snap:${job.id}`, `res:${resource.coolifyUuid}`]);
    manifest.resticSnapshotId = snapId;
    // Re-write the manifest with the id so a local copy reflects reality.
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    emit("info", `Stored as restic snapshot ${snapId}`, 95);
  } else {
    // tar engine: one file per artifact at the destination.
    emit("info", "Uploading to destination", 80);
    const transfer = await transferFor();
    for (const a of artifacts) {
      if (sentDirect.has(a.filename)) continue;
      const local = join(stage, a.filename);
      await transfer.put(local, `${job.destinationDir}/${a.filename}`);
    }
    await transfer.put(manifestPath, `${job.destinationDir}/${MANIFEST_FILE}`);

    // Verify every artifact actually landed (catches a truncated upload).
    emit("info", "Verifying backup at the destination", 95);
    const present = new Set(await transfer.list(job.destinationDir).catch(() => []));
    const missing = [...artifacts.map((a) => a.filename), MANIFEST_FILE].filter(
      (f) => !present.has(`${job.destinationDir}/${f}`),
    );
    if (missing.length) throw new Error(`Backup verification failed: missing at destination: ${missing.join(", ")}`);
  }

  await Promise.all(healthWatches);
  emit("info", "Backup complete", 100);
  stored = true;
  return manifest;
  } finally {
    if (!stored && restic && parts.length) {
      await resticForget(restic, parts, false).catch((e) => emit("warn", `Could not drop restic snapshots of the failed backup: ${(e as Error).message}`));
    }
    await restic?.cleanup().catch(() => undefined);
    // Post-backup hooks always run (e.g. bring an app back out of maintenance),
    // best-effort and in REVERSE order (undo the last pre hook first), then clean
    // the staging dir.
    for (const h of [...hooks].reverse()) {
      if (!h.post) continue;
      await runHook("post", h.container, h.post, h.timeoutSec).catch((e) => emit("warn", (e as Error).message));
    }
    await transfer?.close().catch(() => undefined);
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Compute size + sha256, optionally encrypt, return the Artifact record. */
async function finalizeArtifact(
  kind: Artifact["kind"],
  baseName: string,
  path: string,
  meta: Record<string, string>,
  job: BackupJob,
  stage: string,
  emit: Emit,
): Promise<Artifact> {
  const sha = await sha256File(path);
  let filename = baseName;
  let finalPath = path;
  let encrypted = false;

  if (job.encryption.enabled) {
    if (!job.encryption.key) throw new Error("Encryption enabled but no key provided");
    filename = `${baseName}.enc`;
    finalPath = join(stage, filename);
    await encryptFile(path, finalPath, job.encryption.key);
    encrypted = true;
    emit("debug", `Encrypted ${baseName} -> ${filename}`);
    // Only the encrypted copy is uploaded: free the plaintext now instead of
    // holding both until the end (it doubled the space a backup needed).
    await rm(path, { force: true });
  }

  const size = (await stat(finalPath)).size;
  return { kind, filename, sizeBytes: size, sha256: sha, encrypted, meta };
}
