import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  type Artifact,
  type BackupJob,
  type DbCredentials,
  pickRepoDigest,
  withDumpCredentials,
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
import { accessDenied, dumpDatabase, dumpDatabaseAnyway, dumpRedis, mysqlUnseenDatabases } from "./dump.js";
import { REDIS_ENGINES, isRedisEngine, type Engine } from "./engines.js";
import {
  hostEntries,
  hostPathKind,
  runningRwContainersForVolume,
  isContainerRunning,
  containerExists,
  containerWritableBytes,
  pathSizeBytes,
  rootStat,
  execShell,
  inspectContainer,
  inspectImage,
  mountDestinations,
  type RunResult,
} from "./docker.js";
import { matchHookTargets, DEFAULT_HOOK_TIMEOUT_SEC } from "./hooks.js";
import { captureImages, captureProvenance } from "./provenance.js";
import { encryptFile, sha256File } from "./crypto.js";
import { makeTransfer, type Transfer } from "./transfer.js";
import { LOCK_WAIT_MESSAGE, resticEnsureRepo, resticBackupDir, resticContext, resticForget, type ResticCtx } from "./restic.js";
import {
  findSqliteFiles,
  hostPathOf,
  resticBackupPaths,
  snapshotPath,
  sqliteConsistentCopy,
  type PathBackup,
  type PathSource,
} from "./restic-helper.js";
import { classifyExcludes, excludesMeta, mountExcludes, nestedFolders } from "./excludes.js";
import { resolveResource, findDbContainers, readDbCredentials, readDbLogins, resourceContainers, uniqueLogins } from "./resolve.js";
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

/** The exact image a container runs: its pullable digest, else its reference. */
async function exactImage(container: string): Promise<string | undefined> {
  const c = await inspectContainer(container).catch(() => null);
  const ref = c?.Config?.Image;
  const img = c?.Image ? await inspectImage(c.Image).catch(() => null) : null;
  return pickRepoDigest(img?.RepoDigests, ref) ?? ref;
}

/** Engines whose data folder a restore drill can start (see drill.ts). */
const DRILLABLE_DB_ENGINES = new Set(["postgresql", "mysql", "mariadb", "mongodb"]);

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
    ctx.onLockWait = () => emit("info", LOCK_WAIT_MESSAGE);
    restic = ctx;
    await resticEnsureRepo(ctx);
    return ctx;
  };
  const parts: string[] = [];
  // Consistent copies of SQLite databases, read in place of the live files
  // (outside the stage: it becomes the main snapshot).
  const sqliteDir = join(workDir, `${job.id}-sqlite`);
  // What the snapshot should show beyond its log (a database that couldn't be dumped...).
  const warnings: string[] = [];
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
  const copyVolumesAndBinds = async (
    /** Containers to freeze even in live mode: their database dump failed, so
     * the copy of their files is the only consistent one there is. */
    forceFreeze: string[] = [],
    /** Volumes / host folders holding a database's files: recorded on their
     * artifact (engine, image, where it's mounted) so a restore drill can start
     * that database on the copy. */
    dbMounts = new Map<string, Record<string, string>>(),
  ): Promise<string> => {
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
      /** The resource's exclusions, plus those naming a path inside this mount. */
      excludes: string[];
    };
    // A host mount can be a single file (an nginx.conf, a password file): it is
    // copied, read back and restored as that file, not as a folder.
    const bindKinds = new Map(await Promise.all(resource.bindMounts.map(async (b) => [b.source, await hostPathKind(b.source)] as const)));
    const candidates: Target[] = [
      ...resource.volumes.map((vol) => ({
        source: vol,
        fileName: volumeFileName(vol),
        label: `volume ${vol}`,
        meta: { volume: vol },
        resticPath: () => snapshotPath("volume", vol),
        freezeContainers: () => runningRwContainersForVolume(vol),
        excludes: job.excludes,
      })),
      ...resource.bindMounts.map((b) => {
        const slug = b.source.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        return {
          source: b.source,
          fileName: volumeFileName("bind-" + slug),
          label: bindKinds.get(b.source) === "file" ? `host file ${b.source}` : `host folder ${b.source}`,
          meta: { bindSource: b.source, ...(bindKinds.get(b.source) ? { bindKind: bindKinds.get(b.source)! } : {}) },
          resticPath: () => snapshotPath("bind", slug),
          freezeContainers: async () => ((await isContainerRunning(b.container)) ? [b.container] : []),
          excludes: job.excludes,
        };
      }),
    ];
    // Exclusions: host paths, container paths and root-relative ones, told
    // apart once against all mounts (see classifyExcludes). One naming a whole
    // mount leaves it out; one inside a mount applies to that mount alone.
    const mountsAt = job.excludes.length ? await mountDestinations(containers) : new Map<string, string[]>();
    const mountOf = (t: Target) => ({ hostPath: t.meta.bindSource, destinations: mountsAt.get(t.source) ?? [] });
    const classified = classifyExcludes(job.excludes, candidates.map(mountOf));
    const everywhere = classified.filter((c) => c.kind === "root").map((c) => c.path);
    const kept: Target[] = [];
    for (const t of candidates) {
      const m = mountExcludes(mountOf(t), classified);
      if (m.skip) {
        emit("info", `Left out entirely: ${t.label} (exclusion: ${m.skip})`);
        continue;
      }
      const own = m.excludes.filter((x) => !everywhere.includes(x));
      if (own.length) emit("info", `Left out of ${t.label}: ${own.join(", ")}`);
      kept.push({
        ...t,
        excludes: m.excludes,
        meta: { ...t.meta, ...excludesMeta(m.excludes), ...(dbMounts.get(t.source) ?? {}) },
      });
    }
    // A host folder inside another one is read with it, not a second time.
    const nested = nestedFolders(kept.filter((t) => t.meta.bindSource).map((t) => t.source));
    for (const [inner, outer] of nested) emit("info", `Host folder ${inner} is inside ${outer}: copied with it`);
    const targets = kept.filter((t) => !nested.has(t.source));
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

    // 2. Every container writing to any of them, frozen once below. In live
    //    mode, only those whose database couldn't be dumped.
    const writers = [...new Set((await Promise.all(targets.map((t) => t.freezeContainers()))).flat())];
    const owners = liveBackup ? writers.filter((c) => forceFreeze.includes(c)) : writers;
    if (liveBackup && owners.length) {
      const msg = `Live mode not applied to ${owners.join(", ")}: its database dump failed, so its files are copied frozen to stay consistent`;
      emit("warn", msg);
      warnings.push(msg);
    }
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

    // 3. restic reads every volume and folder in ONE command (one start, one
    //    index load): first without freezing (only worth it when freezing),
    //    then frozen, when only what moved in between is read. The first pass
    //    stays in the repository as the final one's parent (tag pass:warm) and
    //    is dropped by the next prune: forgetting it here would wait for an
    //    exclusive lock behind any other backup of the same destination.
    const tags = [`snap:${job.id}`, `res:${resource.coolifyUuid}`, "part:volume"];
    const repo = plans.filter((p) => p.choice.where === "repository").map((p) => p.t);
    const items: PathSource[] = repo.map((t) => ({ source: t.source, path: t.resticPath(), excludes: t.excludes }));
    // SQLite databases in the copied folders (n8n, Uptime Kuma...): a copy made
    // consistently while the application runs is read in place of the live
    // file - which a frozen pass would re-read whole whenever it changed, and
    // which a live copy could catch half-written.
    for (const [n, t] of repo.entries()) {
      if (t.meta.dbEngine) continue; // a database server's own data folder: dumped or frozen as such
      if (t.meta.bindKind === "file") continue; // a single file, not a folder to search
      for (const [k, f] of (await findSqliteFiles(t.source).catch(() => [])).entries()) {
        const room = await freeBytes(workDir);
        if (room !== null && room - f.bytes < minFreeBytes()) {
          emit("warn", `No room on the agent host for a consistent copy of the SQLite database ${f.path} in ${t.label}: the live file is backed up`);
          continue;
        }
        const out = join(sqliteDir, `${n}-${k}.sqlite`);
        const t0 = Date.now();
        try {
          await mkdir(sqliteDir, { recursive: true });
          await sqliteConsistentCopy(await resticFor(), workDir, t.source, f.path, out);
          const item = items[n];
          item.overlays = [...(item.overlays ?? []), { hostFile: await hostPathOf(out), at: f.path }];
          item.skip = [...(item.skip ?? []), `/${f.path}-wal`, `/${f.path}-shm`, `/${f.path}-journal`];
          emit(
            "info",
            `SQLite database ${f.path} in ${t.label} (${mib(f.bytes)}): consistent copy made while running in ${((Date.now() - t0) / 1000).toFixed(1)}s, backed up in place of the live file`,
          );
        } catch (e) {
          emit("warn", `Could not copy the SQLite database ${f.path} in ${t.label} consistently (${(e as Error).message}): the live file is backed up`);
        }
      }
    }
    const roots = new Map<Target, Awaited<ReturnType<typeof rootStat>>>();
    let sizes = new Map<string, number>();
    for (const t of repo) roots.set(t, await rootStat(t.source));
    if (repo.length && owners.length) {
      emit("info", `Reading ${repo.length} volume(s)/folder(s) into the restic repository before freezing`, 30);
      const w = await resticBackupPaths(await resticFor(), workDir, items, [...tags, "pass:warm"], { sizes: true });
      sizes = w.sizes;
      emit("info", `First pass: ${describePass(w)}`);
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
      if (liveBackup && writers.length > owners.length) emit("warn", `Live copy without freezing (at your own risk) - may be inconsistent`);
      if (repo.length) {
        emit("info", owners.length ? `Final pass on ${repo.length} volume(s)/folder(s) while frozen` : `Backing up ${repo.length} volume(s)/folder(s) with restic`, 55);
        // Frozen: wait for another command's lock a minute at most, never longer.
        const b = await resticBackupPaths(await resticFor(), workDir, items, tags, {
          lockWait: owners.length ? "1m" : undefined,
          sizes: !owners.length,
        });
        if (!owners.length) sizes = b.sizes;
        parts.push(b.id);
        emit("info", `${owners.length ? "Final pass" : "Backed up"}: ${describePass(b)}`, 65);
        for (const t of repo) {
          const path = t.resticPath();
          const root = roots.get(t);
          artifacts.push({
            kind: "volume",
            filename: t.fileName,
            sizeBytes: sizes.get(path) ?? 0,
            encrypted: false,
            meta: {
              ...t.meta,
              [RESTIC_PART_META]: b.id,
              resticPath: path,
              ...(root ? { rootOwner: root.owner, rootMode: root.mode } : {}),
            },
          });
        }
      }
      for (const [n, { t, choice, needBytes }] of plans.entries()) {
        if (choice.where === "repository") continue;
        const progress = 50 + (20 * (n + 1)) / total;
        const filename = job.encryption.enabled ? `${t.fileName}.enc` : t.fileName;
        emit("info", `Archiving ${t.label} (${n + 1}/${total})`, progress);
        // One pass: tar -> read-back check -> sha256 -> (encrypt) -> local file or
        // the destination. An encrypted copy no longer needs twice the room.
        const target = choice.where === "local" ? join(stage, filename) : `${job.destinationDir}/${filename}`;
        const sink =
          choice.where === "local"
            ? (body: Readable) => pipeline(body, createWriteStream(target))
            : async (body: Readable) => (await transferFor()).putStream(body, target, needBytes ?? undefined);
        const res = await captureTar(t.source, sink, job.encryption.enabled ? job.encryption.key : undefined, t.excludes, t.meta.bindKind === "file");
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
    return liveBackup && writers.length > owners.length ? "live" : "frozen";
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
    /** false: a fallback follows, the failure is only logged. */
    warnIfFailed = true,
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
      // The login set in CBM for this resource, if any, wins over the container's environment.
      const logins = job.dumpCredentials
        ? [withDumpCredentials(await readDbCredentials(container, engine), job.dumpCredentials) ?? {}]
        : await readDbLogins(container, engine);
      const name = `dump-${engine}-${container}.sql`.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = join(stage, name);
      const { creds, client } = await dumpWithLogins(engine, container, logins, path, progress);
      await warnUnseenDatabases(engine, container, creds, client);
      const sqlMeta = { engine, container, ...meta, ...(await imageMeta(container)) };
      return await finalizeArtifact("db-dump", name, path, sqlMeta, job, stage, emit);
    } catch (e) {
      const msg =
        `Logical export of ${container} (${engine}) failed: ${(e as Error).message}` +
        (accessDenied(e) ? ` - set the login to use in the resource's Options (Database dump login)` : "");
      emit("warn", msg);
      if (warnIfFailed) warnings.push(msg);
      return null;
    }
  };

  // Which login a dump uses, for the log - never the user name itself (some are
  // generated, close to a secret).
  const loginLabel = (engine: string, creds: DbCredentials) =>
    job.dumpCredentials
      ? "the login set in CBM"
      : engine !== "mysql" && engine !== "mariadb"
        ? "the configured user"
        : creds.user === "root"
          ? "root"
          : "the application user";

  // A dump with the first login the database accepts: a refused one (a
  // password changed since the container was created) moves on to the next.
  const dumpWithLogins = async (engine: Engine, container: string, logins: DbCredentials[], path: string, progress: number) => {
    for (const [i, creds] of logins.entries()) {
      emit("info", `Dumping ${engine} (${container}) as ${loginLabel(engine, creds)} - no downtime`, progress);
      try {
        const client = await dumpDatabaseAnyway(engine, container, creds, path);
        if (client) emit("info", `${container} has no ${engine} client tools: dumped with ${client}`);
        return { creds, client };
      } catch (e) {
        const next = logins[i + 1];
        if (!next || !accessDenied(e)) throw e;
        emit("info", `${loginLabel(engine, creds)} was refused by ${container}: trying ${loginLabel(engine, next)}`);
      }
    }
    throw new Error("no login to dump with");
  };

  // A MySQL/MariaDB dumped as a user other than root only holds the databases
  // that user sees: say which others are only in the volume copy.
  const warnUnseenDatabases = async (engine: string, container: string, creds: DbCredentials | undefined, image?: string) => {
    if ((engine !== "mysql" && engine !== "mariadb") || !creds?.user || creds.user === "root") return;
    const unseen = await mysqlUnseenDatabases(engine, container, creds, image);
    if (!unseen.length) return;
    const msg =
      `The dump of ${container} as ${loginLabel(engine, creds)} leaves out database(s) it can't see: ${unseen.join(", ")} - ` +
      `they are only in the volume copy (set a login that sees them in the resource's Options)`;
    emit("warn", msg);
    warnings.push(msg);
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
      const engine = resource.type;
      const dumpName = dumpFileName(engine, resource.db?.database);
      const dumpPath = join(stage, dumpName);
      // Coolify's credentials first, then what the container's environment offers.
      const logins = job.dumpCredentials
        ? [withDumpCredentials(resource.db, job.dumpCredentials) ?? {}]
        : uniqueLogins([resource.db ?? {}, ...(await readDbLogins(primary, resource.type).catch(() => []))]);
      const { creds, client } = await dumpWithLogins(resource.type as Engine, primary, logins, dumpPath, 20);
      await warnUnseenDatabases(engine, primary, creds, client);
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
        ? await dumpContainer(primary, resource.type as Engine, { volume: dataVolume }, 20, false)
        : null;
    if (art) {
      artifacts.push(art);
      captureMethod = "dump";
    } else {
      emit("warn", `Falling back to a frozen volume copy for ${resource.type}`);
      captureMethod = await copyVolumesAndBinds(primary ? [primary] : []);
    }
  } else {
    // Apps & services: capture every volume + bind mount (no restart), AND give
    // any database living inside the resource (e.g. the Postgres in a compose
    // service) a logical export on top - application-consistent and restorable
    // across engine versions. The volume copy is kept so "→ new" still works.
    const dbs = await findDbContainers(containers);
    let dumped = 0;
    const notDumped: string[] = [];
    for (const db of dbs) {
      const art = await dumpContainer(db.container, db.engine, { volume: db.volumes[0] ?? "" }, 15);
      if (art) {
        artifacts.push(art);
        dumped++;
      } else notDumped.push(db.container);
    }
    const dbMounts = new Map<string, Record<string, string>>();
    for (const db of dbs) {
      if (!DRILLABLE_DB_ENGINES.has(db.engine)) continue;
      const image = await exactImage(db.container);
      // Postgres: the role to connect as and its data folder (PGDATA may be a
      // sub-folder of the mount).
      const env = Object.fromEntries(
        ((await inspectContainer(db.container).catch(() => null))?.Config?.Env ?? []).map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]),
      ) as Record<string, string>;
      const pg = db.engine === "postgresql" ? { dbUser: env.POSTGRES_USER || "postgres", ...(env.PGDATA ? { dbDataDir: env.PGDATA } : {}) } : {};
      for (const m of db.mounts) {
        dbMounts.set(m.source, {
          dbEngine: db.engine,
          dbContainer: db.container,
          dbPath: m.destination,
          ...(image ? { dbImage: image } : {}),
          ...pg,
        });
      }
    }
    const volMethod = await copyVolumesAndBinds(notDumped, dbMounts);
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
    ...(warnings.length ? { warnings } : {}),
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
      // Short wait: never hold a job slot behind another job's exclusive lock.
      await resticForget(restic, parts, false, "1m").catch((e) => emit("warn", `Could not drop restic snapshots of the failed backup: ${(e as Error).message}`));
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
    await rm(sqliteDir, { recursive: true, force: true }).catch(() => undefined);
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
