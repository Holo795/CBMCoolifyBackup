import {
  type BackupJob,
  type RestoreJob,
  type PruneJob,
  type MirrorJob,
  type RestoreDrillJob,
  type ResolvedDestination,
  type EncryptionSpec,
  type SnapshotManifest,
  type ResourceDescriptor,
  type ResourceType,
  type StorageSpec,
  type CapturedConfig,
  snapshotDir,
} from "@cbm/shared";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./crypto";
import { effectivePolicy } from "./schedule";
import { CoolifyClient, GENERATED_SECRET, type AppVolume, type DbEngine, type CloneEngine, type DbConfig, type CoolifyRaw } from "./coolify";
import { syncInstance } from "./discovery";
import { remapEnv, type RemapChange } from "./remap";
import { UserError } from "./user-error";
import type { Destination, Prisma } from "@/generated/prisma/client";
import { version as CBM_VERSION } from "../../package.json";

const DUMP_ENGINES: DbEngine[] = ["postgresql", "mysql", "mariadb", "mongodb"];
const VOLUME_DB_ENGINES = ["redis", "keydb", "dragonfly", "clickhouse"];

/** Decrypt a destination's stored config into a ResolvedDestination. */
export function resolveDestination(dest: Destination): ResolvedDestination {
  return JSON.parse(decryptSecret(dest.configEnc)) as ResolvedDestination;
}

export function resolveEncryption(dest: Destination): EncryptionSpec {
  // restic encrypts the repository natively, so artifacts are never double-encrypted.
  if (dest.engine === "restic") return { enabled: false };
  if (dest.encryptionEnabled && dest.encryptionKeyEnc) {
    return { enabled: true, key: decryptSecret(dest.encryptionKeyEnc) };
  }
  return { enabled: false };
}

/** Normalise a resource's stored hooks JSON into the BackupJob hook list. */
function parseResourceHooks(raw: unknown): BackupJob["hooks"] {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
    .map((h) => ({
      container: typeof h.container === "string" ? h.container : "",
      pre: typeof h.pre === "string" ? h.pre : undefined,
      post: typeof h.post === "string" ? h.post : undefined,
      timeoutSec:
        typeof h.timeoutSec === "number" && Number.isInteger(h.timeoutSec) && h.timeoutSec >= 1 && h.timeoutSec <= 3600
          ? h.timeoutSec
          : undefined,
    }))
    .filter((h) => h.pre || h.post);
  return out.length ? out : undefined;
}

/** Storage engine + secrets for a destination (tar files vs a restic repo). */
export function resolveStorage(dest: Destination): StorageSpec {
  if (dest.engine === "restic") {
    if (!dest.resticPasswordEnc) throw new UserError("messages.resticNoPassword", { name: dest.name });
    return { engine: "restic", resticPassword: decryptSecret(dest.resticPasswordEnc) };
  }
  return { engine: "tar" };
}

/** A new agent-job id, generated up front (see createAgentJob). */
function newJobId(): string {
  return randomUUID();
}

/**
 * Queue an agent job in ONE write, payload included. Creating the row first and
 * filling the payload afterwards let an agent claim an empty job in between (it
 * then failed to parse it and the job sat "running" until the reaper).
 */
async function createAgentJob(data: {
  id: string;
  agentId: string;
  type: string;
  payload: unknown;
  snapshotId?: string;
  restoreId?: string;
}): Promise<void> {
  await prisma.agentJob.create({
    data: { ...data, status: "queued", payload: data.payload as Prisma.InputJsonValue },
  });
}

/**
 * Pick the agent that should run a job for a resource on `serverUuid` of a
 * Coolify instance. An agent only sees its own host's Docker, so in a
 * multi-server instance the job MUST go to the agent on the resource's server.
 * Priority:
 *   1. an online agent whose serverUuid matches the resource's server;
 *   2. if the server is unknown (null) → any online agent of the instance
 *      (legacy / single-server behaviour);
 *   3. if exactly one online agent serves the instance → use it (single-server
 *      convenience, e.g. before auto-detection has run);
 *   4. otherwise null - the caller raises a clear "no agent on server X" error.
 */
async function pickAgent(instanceId: string | null, serverUuid?: string | null) {
  if (serverUuid) {
    const onServer = await prisma.agent.findFirst({
      where: { instanceId, status: "online", serverUuid },
      orderBy: { lastSeenAt: "desc" },
    });
    if (onServer) return onServer;
  }

  const online = await prisma.agent.findMany({
    where: { instanceId, status: "online" },
    orderBy: { lastSeenAt: "desc" },
  });
  if (!serverUuid) {
    // Unknown server: any ONLINE agent of the instance. Never an offline one (the
    // job would sit queued and run whenever it came back - possibly days later)
    // and never another instance's agent (it can't see this resource).
    return online[0] ?? null;
  }
  // Server known but no agent matched it: only safe to fall back when there's a
  // single online agent (it can only be the one host). Otherwise refuse rather
  // than back up on the wrong server.
  if (online.length === 1) return online[0];
  return null;
}

/** Fetch a specific agent by id (used to target the producer of a snapshot). */
async function agentById(agentId: string | null | undefined) {
  if (!agentId) return null;
  return prisma.agent.findUnique({ where: { id: agentId } });
}

/**
 * Refuse to start a backup or an in-place restore while another one is in
 * flight for the same resource: two backups would double-freeze its containers,
 * and a restore would stop them in the middle of a backup's copy. Restores to a
 * new resource and drills don't touch the original, so they never conflict.
 */
async function assertResourceIdle(resourceId: string, resourceName: string): Promise<void> {
  const [backup, restore] = await Promise.all([
    prisma.snapshot.findFirst({ where: { resourceId, status: "running", mirrorOfId: null }, select: { id: true } }),
    prisma.restoreJob.findFirst({
      where: { status: "running", target: "in_place", snapshot: { resourceId } },
      select: { id: true },
    }),
  ]);
  if (backup) throw new UserError("messages.backupInProgress", { name: resourceName });
  if (restore) throw new UserError("messages.restoreInProgress", { name: resourceName });
}

/** Create a Snapshot + queued AgentJob for a backup. */
export async function enqueueBackup(resourceId: string, policyId?: string, runId?: string) {
  const resource = await prisma.resource.findUniqueOrThrow({ where: { id: resourceId } });
  await assertResourceIdle(resource.id, resource.name);
  let policy = policyId
    ? await prisma.backupPolicy.findUniqueOrThrow({ where: { id: policyId }, include: { destination: true } })
    : null;

  // For a manual "Backup now", fall back to the resource's effective schedule
  // (resource override -> server -> instance) to pick destination + mode.
  if (!policy) {
    const eff = await effectivePolicy(resource.id);
    policy = eff.policy ?? null;
  }

  const dest = policy?.destination ?? (await prisma.destination.findFirst());
  if (!dest) throw new UserError("messages.noDestination");

  const agent = await pickAgent(resource.instanceId, resource.serverUuid);
  if (!agent) {
    throw new UserError("messages.noAgentForBackup", {
      server: resource.serverName ?? resource.serverUuid ?? "",
      name: resource.name,
    });
  }

  const mode = (policy?.mode ?? "backup") as "backup" | "sync";
  const liveBackup = resource.liveBackup;
  // Descriptive label of how it will be captured (the agent confirms it in the
  // manifest). Databases are dumped live; everything else is frozen-then-copied
  // unless the operator opted into a live (no-freeze) copy.
  const isDumpable = DUMP_ENGINES.includes(resource.type as DbEngine);
  const captureMode = isDumpable ? "dump" : liveBackup ? "live" : "frozen";
  const iso = new Date().toISOString();
  const dir = snapshotDir(resource.instanceId, resource.coolifyUuid, mode, iso);

  // For real Coolify databases, read the dump credentials from the Coolify API
  // (authoritative) rather than relying on the container's env at backup time.
  const db = await dbCredsFor(resource);
  // Capture env vars (apps/services) into the snapshot so it's self-contained.
  const envEnc = await envEncFor(resource);
  // Capture the full resource definition so the snapshot can be rebuilt on a
  // fresh Coolify even after the source instance is gone (DR / migration).
  const capturedConfig = await capturedConfigFor(resource);

  const snapshot = await prisma.snapshot.create({
    data: {
      resourceId: resource.id,
      policyId: policy?.id,
      destinationId: dest.id,
      agentId: agent.id,
      mode,
      captureMode,
      status: "running",
      destinationDir: dir,
      runId,
    },
  });

  // The job id is the correlation id agents post events/results to; it is
  // generated up front so the row is created with its full payload at once.
  const jobId = newJobId();
  const job: BackupJob = {
    id: jobId,
    type: "backup",
    mode,
    liveBackup,
    envEnc,
    capturedConfig,
    resource: {
      coolifyUuid: resource.coolifyUuid,
      name: resource.name,
      type: resource.type as BackupJob["resource"]["type"],
      containerName: resource.containerName ?? undefined,
      containerNames: resource.containerNames,
      volumes: resource.volumes,
      bindMounts: [], // the agent re-resolves bind mounts from Docker
      db,
    },
    destination: resolveDestination(dest),
    encryption: resolveEncryption(dest),
    storage: resolveStorage(dest),
    hooks: parseResourceHooks(resource.hooks),
    destinationDir: dir,
  };

  await createAgentJob({ id: jobId, agentId: agent.id, type: "backup", payload: job, snapshotId: snapshot.id });

  return { snapshotId: snapshot.id, agentId: agent.id, jobId };
}

/**
 * Clone a resource into a brand-new Coolify resource (same project/env/server,
 * new name) for a "restore → new" so the original is never touched. Returns the
 * descriptor the agent will resolve + restore into.
 *
 *  - dump DBs (pg/mysql/maria/mongo) with a logical dump  -> created + deployed,
 *    the agent loads the dump into the running clone.
 *  - everything else (volume-based DBs, redis/keydb/..., apps, services)        ->
 *    created but NOT deployed; the agent pre-fills the remapped volumes so the
 *    data is present on the operator's first deploy. Apps pin the captured
 *    commit / image tag so the code matches the data.
 */
async function cloneForRestore(
  resource: { coolifyUuid: string; name: string; type: string; projectName: string; environment: string; instanceId: string },
  manifest: SnapshotManifest,
  /** Clone onto a DIFFERENT connected Coolify (migration). Default: the snapshot's own instance. */
  targetInstanceId?: string,
  /** Original → clone uuids of resources already restored onto the target, to
   * rewire this clone's env references (see lib/remap). */
  mapping: Record<string, string> = {},
): Promise<{ descriptor: ResourceDescriptor; changes: RemapChange[]; volumeRenames?: Record<string, string> }> {
  const migrating = !!targetInstanceId && targetInstanceId !== resource.instanceId;
  const instance = await prisma.coolifyInstance.findUniqueOrThrow({
    where: { id: targetInstanceId ?? resource.instanceId },
  });
  const client = new CoolifyClient(instance.baseUrl, decryptSecret(instance.apiTokenEnc));
  const short = resource.coolifyUuid.slice(0, 4) + Date.now().toString(36).slice(-4);
  const newName = `${resource.name}-restored-${short}`.slice(0, 48);
  // With a captured config (DR/migration) the clone is fully reconstructed from
  // the snapshot and never reads the source resource — the source Coolify may
  // be gone. Without one (older snapshots), fall back to the live-read path —
  // and when migrating, live-read from the SOURCE instance (alive in that case)
  // since the source resource doesn't exist on the target.
  const cfg = manifest.capturedConfig;
  const srcClient = migrating
    ? await prisma.coolifyInstance
        .findUnique({ where: { id: resource.instanceId } })
        .then((src) => (src ? new CoolifyClient(src.baseUrl, decryptSecret(src.apiTokenEnc)) : null))
    : null;
  const projectName = cfg?.projectName ?? resource.projectName;
  const environmentName = cfg?.environmentName ?? resource.environment ?? "production";
  const type = resource.type as ResourceType;
  // Land on a server that exists on the TARGET: the captured one if it's still
  // there, else its mapped counterpart (multi-server targets), else the
  // only/first server (single-server DR collapses everything).
  const serverMap = (instance.serverUuidMap as Record<string, string> | null) ?? undefined;
  const serverUuid = cfg || migrating ? await client.resolveTargetServer(cfg?.serverUuid, serverMap) : undefined;
  // The clone usually keeps the source type, but a floating-tag docker-image app
  // is cloned as a digest-pinned service (see cloneApplication), so track it.
  let clonedType: ResourceType = type;
  let volumeRenames: Record<string, string> | undefined;
  const descriptor = (newUuid: string): ResourceDescriptor => ({
    coolifyUuid: newUuid,
    name: newName,
    type: clonedType,
    containerNames: [],
    volumes: [],
    bindMounts: [],
  });

  let newUuid: string;
  let changes: RemapChange[] = [];
  if (DUMP_ENGINES.includes(resource.type as DbEngine) || VOLUME_DB_ENGINES.includes(resource.type)) {
    // Databases: dump engines deploy only when there's a logical dump to load;
    // volume-based ones (redis/keydb/...) stay undeployed for volume pre-fill.
    const hasDump =
      DUMP_ENGINES.includes(resource.type as DbEngine) &&
      (manifest.artifacts ?? []).some((a) => a.kind === "db-dump");
    const src =
      cfg?.kind === "database"
        ? ({
            ...cfg.raw,
            ...(cfg.dbCredsEnc ? (JSON.parse(decryptSecret(cfg.dbCredsEnc)) as Record<string, unknown>) : {}),
          } as unknown as DbConfig)
        : migrating && srcClient
          ? await srcClient.getDatabase(resource.coolifyUuid)
          : undefined;
    newUuid = await client.cloneDatabase({
      sourceUuid: resource.coolifyUuid,
      type: resource.type as CloneEngine,
      newName,
      projectName,
      environmentName,
      instantDeploy: hasDump,
      src,
      serverUuid,
    });
    if (hasDump) await client.waitDatabaseRunning(newUuid);
  } else if (type === "application") {
    const sha = manifest.provenance?.gitCommitSha;
    // Remap the captured git auth by NAME onto the target (numeric ids don't
    // travel); missing auth falls through to the public-endpoint path.
    let githubAppUuid: string | undefined;
    let privateKeyUuid: string | undefined;
    if (cfg?.kind === "application") {
      if (cfg.gitSourceName) githubAppUuid = await client.findSourceUuidByName(cfg.gitSourceName);
      else if (cfg.privateKeyName) privateKeyUuid = await client.findPrivateKeyUuidByName(cfg.privateKeyName);
    }
    const captured = cfg?.kind === "application" ? (cfg.raw.volumes as AppVolume[] | undefined) : undefined;
    const volumes = captured ?? (await (srcClient ?? client).getAppVolumes(resource.coolifyUuid));
    const cloned = await client.cloneApplication({
      volumes: cloneVolumes(volumes, resource.coolifyUuid),
      sourceUuid: resource.coolifyUuid,
      newName,
      projectName,
      environmentName,
      gitCommitSha: sha && sha !== "HEAD" ? sha : undefined,
      imageRef: manifest.provenance?.imageRef,
      imageDigest: manifest.provenance?.imageDigest,
      src:
        cfg?.kind === "application"
          ? (cfg.raw as CoolifyRaw)
          : migrating && srcClient
            ? await srcClient.getApplication(resource.coolifyUuid)
            : undefined,
      serverUuid,
      githubAppUuid,
      privateKeyUuid,
    });
    newUuid = cloned.uuid;
    clonedType = cloned.type;
    // An application's volumes live outside its image: recreate them on the
    // clone (a digest-pinned service clone declared them in its compose), or
    // the restored data never gets mounted. Coolify names them itself, so the
    // data goes into whatever it actually created, matched by mount path.
    if (cloned.type === "application") {
      await client.addAppVolumes(newUuid, cloneVolumes(volumes, resource.coolifyUuid));
      volumeRenames = matchVolumes(volumes, await client.getAppVolumes(newUuid));
    } else {
      volumeRenames = matchVolumes(volumes, await client.getServiceVolumes(newUuid));
    }
    // Env from the snapshot if present (autonomous), else live from the original.
    changes = await applyEnv(
      client,
      srcClient ?? client,
      manifest,
      cloned.type === "service" ? "services" : "applications",
      newUuid,
      "applications",
      resource.coolifyUuid,
      mapping,
    );
  } else if (type === "service") {
    const src =
      cfg?.kind === "service"
        ? ({
            ...cfg.raw,
            docker_compose_raw: cfg.composeEnc ? decryptSecret(cfg.composeEnc) : undefined,
          } as CoolifyRaw)
        : migrating && srcClient
          ? await srcClient.getService(resource.coolifyUuid)
          : undefined;
    newUuid = await client.cloneService({
      sourceUuid: resource.coolifyUuid,
      newName,
      projectName,
      environmentName,
      src,
      serverUuid,
    });
    changes = await applyEnv(client, srcClient ?? client, manifest, "services", newUuid, "services", resource.coolifyUuid, mapping);
  } else {
    throw new UserError("messages.cloneUnsupportedType", { type: resource.type });
  }

  // Surface the new resource in the controller UI.
  await syncInstance(instance.id).catch(() => undefined);
  return { descriptor: descriptor(newUuid), changes, volumeRenames };
}

/** The volumes to create on a clone: same mounts, names without the original's
 * uuid prefix (Coolify prefixes a new volume with its application's uuid, so
 * the clone never mounts the original's volume). */
export function cloneVolumes(volumes: AppVolume[], oldUuid: string): AppVolume[] {
  const prefix = `${oldUuid.replace(/-/g, "")}-`;
  return volumes.map((v) => ({ ...v, name: v.name.startsWith(prefix) ? v.name.slice(prefix.length) : v.name }));
}

/** Original volume name → the clone's volume mounted at the same path. */
export function matchVolumes(original: AppVolume[], clone: AppVolume[]): Record<string, string> {
  const byMount = new Map(clone.map((v) => [v.mountPath, v.name]));
  const out: Record<string, string> = {};
  for (const v of original) {
    const name = byMount.get(v.mountPath);
    if (name) out[v.name] = name;
  }
  return out;
}

/**
 * Map each captured volume name to the clone's volume name. Coolify derives
 * volume names from the resource uuid, so swapping the (dash-stripped) old uuid
 * for the new one yields the name the clone will mount on first deploy. Volumes
 * that don't carry the uuid are left unmapped (and the agent skips them).
 */
function buildVolumeMap(
  manifest: SnapshotManifest,
  oldUuid: string,
  newUuid: string,
): Record<string, string> | undefined {
  const o = oldUuid.replace(/-/g, "");
  const n = newUuid.replace(/-/g, "");
  const map: Record<string, string> = {};
  for (const a of manifest.artifacts ?? []) {
    if (a.kind !== "volume") continue;
    const v = a.meta?.volume;
    if (!v || !v.includes(o)) continue;
    map[v] = v.split(o).join(n);
  }
  return Object.keys(map).length ? map : undefined;
}

/** Authoritative dump/restore DB credentials from the Coolify API (the
 * container env isn't always reliable). undefined for non-DB / coolify-self. */
async function dbCredsFor(resource: {
  type: string;
  coolifyUuid: string;
  instanceId: string;
}): Promise<{ user?: string; password?: string; database?: string } | undefined> {
  if (!DUMP_ENGINES.includes(resource.type as DbEngine) || resource.coolifyUuid.startsWith("coolify-self")) {
    return undefined;
  }
  const instance = await prisma.coolifyInstance.findUnique({ where: { id: resource.instanceId } });
  if (!instance) return undefined;
  const client = new CoolifyClient(instance.baseUrl, decryptSecret(instance.apiTokenEnc));
  return client.getDbCredentials(resource.coolifyUuid, resource.type as DbEngine).catch(() => undefined);
}

/** Capture an app/service's env vars from Coolify, master-key-encrypted, so the
 * snapshot is self-contained. undefined for other types, coolify-self, or none. */
async function envEncFor(resource: { type: string; coolifyUuid: string; instanceId: string }): Promise<string | undefined> {
  const kind = resource.type === "application" ? "applications" : resource.type === "service" ? "services" : null;
  if (!kind || resource.coolifyUuid.startsWith("coolify-self")) return undefined;
  const instance = await prisma.coolifyInstance.findUnique({ where: { id: resource.instanceId } });
  if (!instance) return undefined;
  const client = new CoolifyClient(instance.baseUrl, decryptSecret(instance.apiTokenEnc));
  const envs = await client.getEnvVars(kind, resource.coolifyUuid).catch(() => []);
  return envs.length ? encryptSecret(JSON.stringify(envs)) : undefined;
}

/* --------------------- captured config (disaster recovery) --------------------- */

/** Non-secret application fields the clone builder reads (see cloneApplication). */
const APP_CONFIG_FIELDS = [
  "name",
  "build_pack",
  "git_repository",
  "git_branch",
  "git_commit_sha",
  "base_directory",
  "install_command",
  "build_command",
  "start_command",
  "publish_directory",
  "static_image",
  "dockerfile_location",
  "docker_compose_location",
  "docker_registry_image_name",
  "docker_registry_image_tag",
  "ports_exposes",
] as const;

/** Per-engine credential fields (superset; see dbCredsBody in coolify.ts).
 * Captured encrypted — they are secrets. */
const DB_CRED_FIELDS = [
  "postgres_user",
  "postgres_password",
  "postgres_db",
  "mysql_user",
  "mysql_password",
  "mysql_database",
  "mysql_root_password",
  "mariadb_user",
  "mariadb_password",
  "mariadb_database",
  "mariadb_root_password",
  "mongo_initdb_root_username",
  "mongo_initdb_root_password",
  "mongo_initdb_database",
  "redis_password",
  "redis_conf",
  "keydb_password",
  "keydb_conf",
  "dragonfly_password",
  "clickhouse_admin_user",
  "clickhouse_admin_password",
] as const;

function pick(src: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  return out;
}

/**
 * Capture the full Coolify resource definition into the snapshot, so a restore
 * can rebuild it on a fresh Coolify with the source instance gone (DR /
 * migration). Best-effort: returns undefined rather than failing the backup.
 */
async function capturedConfigFor(resource: {
  type: string;
  name: string;
  coolifyUuid: string;
  instanceId: string;
  projectName: string;
  environment: string;
  serverUuid: string | null;
  serverName: string | null;
}): Promise<CapturedConfig | undefined> {
  if (resource.coolifyUuid.startsWith("coolify-self")) return undefined;
  const instance = await prisma.coolifyInstance.findUnique({ where: { id: resource.instanceId } });
  if (!instance) return undefined;
  const client = new CoolifyClient(instance.baseUrl, decryptSecret(instance.apiTokenEnc));

  const base = {
    version: 1 as const,
    projectName: resource.projectName || "default",
    environmentName: resource.environment || "production",
    serverUuid: resource.serverUuid ?? undefined,
    serverName: resource.serverName ?? undefined,
    coolifyVersion: (await client.ping().catch(() => ({ version: undefined as string | undefined }))).version,
    cbmVersion: CBM_VERSION,
  };

  try {
    if (resource.type === "application") {
      const src = await client.getApplication(resource.coolifyUuid);
      const cfg: CapturedConfig = {
        ...base,
        kind: "application",
        fqdn: typeof src.fqdn === "string" ? src.fqdn : undefined,
        // + its named volumes, which the clone must recreate (not part of the app object).
        raw: { ...pick(src, APP_CONFIG_FIELDS), volumes: await client.getAppVolumes(resource.coolifyUuid) },
        dbCredsEnc: undefined,
        composeEnc: undefined,
        gitSourceName: undefined,
        privateKeyName: undefined,
      };
      // Portable git-auth hints (numeric ids don't travel to a new Coolify).
      if (typeof src.source_id === "number") cfg.gitSourceName = await client.getSourceNameById(src.source_id);
      else if (typeof src.private_key_id === "number")
        cfg.privateKeyName = await client.getPrivateKeyNameById(src.private_key_id);
      return cfg;
    }

    if (resource.type === "service") {
      const src = await client.getService(resource.coolifyUuid);
      const compose = src.docker_compose_raw ?? src.docker_compose ?? src.docker_compose_yaml;
      return {
        ...base,
        kind: "service",
        fqdn: undefined,
        raw: pick(src, ["name", "service_type"]),
        dbCredsEnc: undefined,
        // Compose may inline secrets (environment: blocks) - store encrypted.
        composeEnc: compose ? encryptSecret(String(compose)) : undefined,
        gitSourceName: undefined,
        privateKeyName: undefined,
      };
    }

    // Everything else: try it as a standalone database (postgresql, mysql,
    // redis, ...). Unknown types simply fail the read and return undefined.
    const src = (await client.getDatabase(resource.coolifyUuid)) as Record<string, unknown>;
    const creds = pick(src, DB_CRED_FIELDS);
    return {
      ...base,
      kind: "database",
      fqdn: undefined,
      raw: pick(src, ["name", "image"]),
      dbCredsEnc: Object.keys(creds).length ? encryptSecret(JSON.stringify(creds)) : undefined,
      composeEnc: undefined,
      gitSourceName: undefined,
      privateKeyName: undefined,
    };
  } catch {
    return undefined;
  }
}

/** Dump/restore credentials from the snapshot's captured config (survives the
 * source Coolify) — mapped per engine exactly like getDbCredentials. */
function dbCredsFromCaptured(
  cfg: CapturedConfig | undefined,
  type: string,
): { user?: string; password?: string; database?: string } | undefined {
  if (!cfg?.dbCredsEnc) return undefined;
  try {
    const raw = JSON.parse(decryptSecret(cfg.dbCredsEnc)) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    switch (type) {
      case "postgresql":
        return { user: str(raw.postgres_user), password: str(raw.postgres_password), database: str(raw.postgres_db) };
      case "mysql":
        return { user: "root", password: str(raw.mysql_root_password), database: str(raw.mysql_database) };
      case "mariadb":
        return {
          user: "root",
          password: str(raw.mariadb_root_password) ?? str(raw.mysql_root_password),
          database: str(raw.mariadb_database) ?? str(raw.mysql_database),
        };
      case "mongodb":
        return {
          user: str(raw.mongo_initdb_root_username),
          password: str(raw.mongo_initdb_root_password),
          database: str(raw.mongo_initdb_database),
        };
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/** Set env on the cloned resource from the snapshot (self-contained) when
 * available, else from the still-present original — with references to
 * already-restored resources rewired to their clones BEFORE the write (the
 * clone's env is created once; we never update an existing resource). */
async function applyEnv(
  client: CoolifyClient,
  /** The original's instance (differs from `client`'s when migrating). */
  srcClient: CoolifyClient,
  manifest: SnapshotManifest,
  destKind: "applications" | "services",
  newUuid: string,
  srcKind: "applications" | "services",
  srcUuid: string,
  mapping: Record<string, string>,
): Promise<RemapChange[]> {
  let envs: Array<Record<string, unknown>> | null = null;
  if (manifest.envEnc) {
    try {
      envs = JSON.parse(decryptSecret(manifest.envEnc)) as Array<Record<string, unknown>>;
    } catch {
      envs = null; // fall back to the live original below
    }
  }
  if (!envs) envs = await srcClient.getEnvVars(srcKind, srcUuid).catch(() => []);
  else if (!envs.some((e) => GENERATED_SECRET.test(String(e.key)))) {
    // Snapshots taken before 2.1 didn't capture the service's generated
    // credentials; take them from the original while it still exists.
    const live = await srcClient.getEnvVars(srcKind, srcUuid).catch(() => []);
    envs = [...envs, ...live.filter((e) => GENERATED_SECRET.test(String(e.key)))];
  }
  const { envs: rewired, changes } = remapEnv(envs, mapping);
  await client.setEnvVars(destKind, newUuid, rewired);
  return changes;
}

/**
 * Original → clone uuid pairs for resources already restored "→ new" onto
 * `instanceId` — the latest clone per source that still exists there — so the
 * clone being created now points at those clones rather than the originals.
 */
async function cloneMappingsFor(instanceId: string, excludeSourceUuid: string): Promise<Record<string, string>> {
  const rows = await prisma.restoreJob.findMany({
    where: {
      targetInstanceId: instanceId,
      targetUuid: { not: null },
      sourceUuid: { not: null },
      NOT: { sourceUuid: excludeSourceUuid },
    },
    orderBy: { createdAt: "desc" },
    select: { sourceUuid: true, targetUuid: true },
  });
  if (rows.length === 0) return {};
  const present = new Set(
    (
      await prisma.resource.findMany({
        where: { instanceId, coolifyUuid: { in: rows.map((r) => r.targetUuid!) }, status: { not: "deleted" } },
        select: { coolifyUuid: true },
      })
    ).map((r) => r.coolifyUuid),
  );
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (!r.sourceUuid || !r.targetUuid || map[r.sourceUuid]) continue; // newest present clone wins
    if (present.has(r.targetUuid)) map[r.sourceUuid] = r.targetUuid;
  }
  return map;
}

/** Create a RestoreJob + queued AgentJob from an existing snapshot. */
export async function enqueueRestore(
  snapshotId: string,
  target: "in_place" | "new_resource" = "in_place",
  /** Restore "→ new" onto a DIFFERENT connected Coolify (migration). */
  targetInstanceId?: string,
) {
  const snapshot = await prisma.snapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: { destination: true, resource: true },
  });
  if (!snapshot.manifest) throw new UserError("messages.noManifestRestore");
  // The control-plane pseudo-resource has no Coolify counterpart to clone.
  if (target === "new_resource" && snapshot.resource.coolifyUuid.startsWith("coolify-self")) {
    throw new UserError("messages.controlPlaneNoClone");
  }
  if (target === "in_place") await assertResourceIdle(snapshot.resource.id, snapshot.resource.name);

  const migrating =
    target === "new_resource" && !!targetInstanceId && targetInstanceId !== snapshot.resource.instanceId;
  // A "local" destination's files live on the producing agent's host — an agent
  // on the target instance can't reach them.
  if (migrating && snapshot.destination.type === "local") {
    throw new UserError("messages.localCrossInstance");
  }

  // Prefer the agent that produced this snapshot (its files live on that host
  // for a "local" destination); otherwise route to an agent on the resource's
  // server. A migration instead runs on the TARGET instance — that's where the
  // clone's volumes live, and ssh/s3 artifacts are reachable from anywhere.
  const producer = migrating ? null : await agentById(snapshot.agentId);
  const agent = migrating
    ? await pickAgent(targetInstanceId, null)
    : producer && producer.status === "online"
      ? producer
      : await pickAgent(snapshot.resource.instanceId, snapshot.resource.serverUuid);
  if (!agent) {
    throw migrating
      ? new UserError("messages.noAgentOnTarget", { name: snapshot.resource.name })
      : new UserError("messages.noAgentForRestore", {
          server: snapshot.resource.serverName ?? snapshot.resource.serverUuid ?? "",
          name: snapshot.resource.name,
        });
  }

  const enc = resolveEncryption(snapshot.destination);
  const manifest = snapshot.manifest as unknown as SnapshotManifest;

  // "→ new": clone into a fresh Coolify resource and restore into it. The
  // volume map tells the agent which (uuid-swapped) volumes to fill.
  let targetResource: ResourceDescriptor | undefined;
  let volumeMap: Record<string, string> | undefined;
  let remapped: RemapChange[] = [];
  const cloneInstanceId = targetInstanceId ?? snapshot.resource.instanceId;
  if (target === "new_resource") {
    // Point this clone at clones of resources already restored onto the same
    // instance (e.g. the restored DB), never back at the originals.
    const mapping = await cloneMappingsFor(cloneInstanceId, snapshot.resource.coolifyUuid);
    const cloned = await cloneForRestore(snapshot.resource, manifest, targetInstanceId, mapping);
    targetResource = cloned.descriptor;
    remapped = cloned.changes;
    volumeMap = buildVolumeMap(manifest, snapshot.resource.coolifyUuid, targetResource.coolifyUuid);
    if (cloned.volumeRenames && Object.keys(cloned.volumeRenames).length > 0) {
      volumeMap = { ...volumeMap, ...cloned.volumeRenames };
    }
  }

  const restore = await prisma.restoreJob.create({
    data: {
      snapshotId: snapshot.id,
      target,
      status: "running",
      ...(targetResource
        ? {
            sourceUuid: snapshot.resource.coolifyUuid,
            targetUuid: targetResource.coolifyUuid,
            targetInstanceId: cloneInstanceId,
            remapped: remapped.length ? (remapped as unknown as Prisma.InputJsonValue) : undefined,
          }
        : {}),
    },
  });

  const jobId = newJobId();
  const job: RestoreJob = {
    id: jobId,
    type: "restore",
    manifest,
    source: resolveDestination(snapshot.destination),
    storage: resolveStorage(snapshot.destination),
    resticSnapshotId: snapshot.resticSnapshotId ?? undefined,
    decryptionKey: enc.enabled ? enc.key : undefined,
    target,
    targetResource,
    volumeMap,
    // Same DB keeps its name/creds in the clone, so the original's creds work.
    // Prefer the snapshot's captured creds (survive the source Coolify).
    db: dbCredsFromCaptured(manifest.capturedConfig, snapshot.resource.type) ?? (await dbCredsFor(snapshot.resource)),
  };

  await createAgentJob({ id: jobId, agentId: agent.id, type: "restore", payload: job, restoreId: restore.id });

  // Make the rewiring visible in the restore's live log.
  if (remapped.length) {
    await prisma.jobEvent.createMany({
      data: remapped.map((c) => ({
        jobId,
        level: "info",
        message: `Rewired ${c.key}: ${c.from} -> ${c.to} (points at the restored clone, not the original)`,
      })),
    });
  }

  return { restoreId: restore.id, agentId: agent.id, jobId };
}

/**
 * Queue an agent job to delete backup directories from a destination. The agent
 * is the one with access to the files (local lives on its host; ssh/s3 are
 * reachable from it). Returns null when no live agent can run it.
 */
export async function enqueuePrune(opts: {
  instanceId: string | null;
  destination: Destination;
  dirs: string[];
  /** restic snapshot ids to forget (restic engine). */
  resticSnapshotIds?: string[];
  /** Target a specific agent (the producer) - required for a "local" destination
   * whose files live on that agent's host. */
  agentId?: string | null;
  /** Snapshots whose rows are removed once this prune succeeds (see
   * lib/snapshot-removal). Extra payload field, ignored by the agent. */
  snapshotIds?: string[];
}): Promise<{ jobId: string; agentId: string } | null> {
  const isRestic = opts.destination.engine === "restic";
  const dirs = opts.dirs.filter(Boolean);
  const resticSnapshotIds = (opts.resticSnapshotIds ?? []).filter(Boolean);
  if (isRestic ? resticSnapshotIds.length === 0 : dirs.length === 0) return null;
  const agent = (await agentById(opts.agentId)) ?? (await pickAgent(opts.instanceId));
  if (!agent) return null;

  const jobId = newJobId();
  const job: PruneJob & { snapshotIds?: string[] } = {
    id: jobId,
    type: "prune",
    destination: resolveDestination(opts.destination),
    storage: resolveStorage(opts.destination),
    dirs,
    resticSnapshotIds,
    snapshotIds: opts.snapshotIds,
  };
  await createAgentJob({ id: jobId, agentId: agent.id, type: "prune", payload: job });
  return { jobId, agentId: agent.id };
}

/** Any online agent (for jobs against a globally-reachable ssh/s3 destination). */
async function anyOnlineAgent() {
  return prisma.agent.findFirst({ where: { status: "online" }, orderBy: { lastSeenAt: "desc" } });
}

/** One group of snapshots to prune, already routed to a single agent. */
export type PruneGroup = {
  destination: Destination;
  instanceId: string | null;
  agentId: string | null;
  dirs: string[];
  resticSnapshotIds: string[];
  snapshotIds: string[];
};

/**
 * Group snapshots so each group can be pruned by exactly one agent. The routing
 * rule (which file deletion correctness depends on) lives only here:
 *  - "local" destination: files are on the producing agent's host → group per agent.
 *  - ssh/s3: reachable from any of the instance's agents → group per instance.
 * Used by both manual destination/snapshot deletion and GFS retention.
 */
export function groupSnapshotsForPrune(
  snaps: Array<{
    id: string;
    destinationDir: string;
    agentId: string | null;
    resticSnapshotId: string | null;
    instanceId: string | null;
    destination: Destination;
  }>,
): PruneGroup[] {
  const groups = new Map<string, PruneGroup>();
  for (const s of snaps) {
    const local = s.destination.type === "local";
    const agentId = local ? s.agentId : null;
    const key = `${s.destination.id}::${local ? `a:${agentId ?? ""}` : `i:${s.instanceId ?? ""}`}`;
    const g =
      groups.get(key) ??
      { destination: s.destination, instanceId: s.instanceId, agentId, dirs: [], resticSnapshotIds: [], snapshotIds: [] };
    g.dirs.push(s.destinationDir);
    g.snapshotIds.push(s.id);
    if (s.resticSnapshotId) g.resticSnapshotIds.push(s.resticSnapshotId);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/**
 * Reconcile a destination: ask an agent to list it and report which snapshots'
 * files are still present. A snapshot whose files are gone is later flagged
 * "missing" + alerted (see the verify branch in the job result route).
 *
 *  - ssh/s3: one job to any online agent (the destination is reachable anywhere).
 *  - local: the files live on each producing agent's host, so one job per agent,
 *    each only covering the snapshots it wrote, routed to that exact agent.
 *
 * Returns how many verify jobs were queued.
 */
export async function enqueueVerifyDestination(
  destinationId: string,
  opts?: { deep?: boolean; readDataSubset?: string },
): Promise<{ queued: number; reason?: "empty" | "no-agent" }> {
  const dest = await prisma.destination.findUnique({ where: { id: destinationId } });
  if (!dest) return { queued: 0, reason: "empty" };

  const isRestic = dest.engine === "restic";
  const deep = !!opts?.deep;
  // restic: re-read a sample of pack data (catches on-disk corruption, not just
  // structure). tar: hand over the AES key so encrypted artifacts can be verified
  // by decrypting them (the GCM tag is the integrity proof).
  const readDataSubset = deep && isRestic ? (opts?.readDataSubset ?? "5%") : undefined;
  const decryptionKey =
    deep && !isRestic && dest.encryptionEnabled && dest.encryptionKeyEnc
      ? decryptSecret(dest.encryptionKeyEnc)
      : undefined;
  // Re-check both healthy and already-missing snapshots (so a backup whose files
  // reappear can flip back to succeeded). restic needs the snapshot id.
  const snaps = await prisma.snapshot.findMany({
    where: {
      destinationId,
      status: { in: ["succeeded", "missing", "corrupt"] },
      ...(isRestic ? { resticSnapshotId: { not: null } } : {}),
    },
    select: { destinationDir: true, agentId: true, resticSnapshotId: true },
  });
  if (snaps.length === 0) return { queued: 0, reason: "empty" };

  const resolved = resolveDestination(dest);
  const storage = resolveStorage(dest);

  // Group by the agent that must run the check. A "local" destination (tar or
  // restic) lives on each producing agent's host; ssh/s3 are reachable anywhere.
  const groups = new Map<string | null, typeof snaps>();
  if (dest.type === "local") {
    for (const s of snaps) {
      const key = s.agentId ?? null;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
  } else {
    groups.set("__any__" as unknown as string, snaps);
  }

  let queued = 0;
  for (const [key, groupSnaps] of groups) {
    if (groupSnaps.length === 0) continue;
    let agent;
    if (key === ("__any__" as unknown as string)) agent = await anyOnlineAgent();
    else if (key === null) {
      console.warn(`[verify] ${groupSnaps.length} local snapshot(s) on destination ${dest.name} have no known agent; skipped`);
      continue;
    } else {
      // A local destination's files are only reachable from the agent that wrote them.
      const producer = await agentById(key);
      agent = producer?.status === "online" ? producer : null;
    }
    if (!agent) {
      console.warn(`[verify] no agent available to check destination ${dest.name} (group ${String(key)})`);
      continue;
    }

    const jobId = newJobId();
    const job = {
      id: jobId,
      type: "verify-destination" as const,
      destination: resolved,
      storage,
      dirs: groupSnaps.map((s) => s.destinationDir),
      resticSnapshotIds: isRestic
        ? groupSnaps.map((s) => s.resticSnapshotId).filter((x): x is string => !!x)
        : undefined,
      deep,
      readDataSubset,
      decryptionKey,
      // Extra (ignored by the agent's parse) so the result route knows which
      // destination + engine these results belong to.
      destinationId,
      engine: dest.engine,
      isDeep: deep,
    };
    await createAgentJob({ id: jobId, agentId: agent.id, type: "verify-destination", payload: job });
    queued++;
  }
  // Snapshots existed but nothing could be queued → no agent able to reach them.
  return queued === 0 ? { queued, reason: "no-agent" } : { queued };
}

/**
 * Mirror a freshly-succeeded backup to its destination's configured second
 * destination (a first-class copy under the target's own crypto). No-op when the
 * source destination has no mirror, or when the snapshot is itself a mirror.
 */
export async function enqueueMirror(sourceSnapshotId: string): Promise<{ queued: boolean; reason?: string }> {
  const snap = await prisma.snapshot.findUnique({
    where: { id: sourceSnapshotId },
    include: { destination: { include: { mirrorTo: true } } },
  });
  if (!snap || snap.status !== "succeeded" || snap.mirrorOfId) return { queued: false };
  if (!snap.manifest) return { queued: false, reason: "no-manifest" };
  const source = snap.destination;
  const target = source.mirrorTo;
  if (!target) return { queued: false };
  // Don't duplicate if this run was already mirrored (idempotent re-delivery).
  const existing = await prisma.snapshot.findFirst({ where: { mirrorOfId: snap.id }, select: { id: true } });
  if (existing) return { queued: false, reason: "already-mirrored" };

  // The copy runs where the source files are reachable: the producing agent for
  // a "local" source, otherwise any online agent.
  const agent = source.type === "local" ? await agentById(snap.agentId) : await anyOnlineAgent();
  if (!agent || agent.status !== "online") return { queued: false, reason: "no-agent" };

  const srcEnc = resolveEncryption(source);
  const tgtEnc = resolveEncryption(target);
  const jobId = newJobId();
  const job: MirrorJob & { sourceSnapshotId: string; targetDestinationId: string } = {
    id: jobId,
    type: "mirror",
    source: resolveDestination(source),
    target: resolveDestination(target),
    sourceStorage: resolveStorage(source),
    targetStorage: resolveStorage(target),
    dir: snap.destinationDir,
    resticSnapshotId: snap.resticSnapshotId ?? undefined,
    sourceEncryptionKey: srcEnc.enabled ? srcEnc.key : undefined,
    targetEncryptionKey: tgtEnc.enabled ? tgtEnc.key : undefined,
    manifest: snap.manifest as unknown as MirrorJob["manifest"],
    // Extras (ignored by the agent's parse) for the result route.
    sourceSnapshotId: snap.id,
    targetDestinationId: target.id,
  };
  await createAgentJob({ id: jobId, agentId: agent.id, type: "mirror", payload: job });
  return { queued: true };
}

/**
 * Queue a restore drill: an agent restores the snapshot into a throwaway
 * sandbox of its own (never Coolify, never the original resource) and reports
 * per-artifact checks. A "local" destination's files live on the producing
 * agent's host, so the drill must run there; otherwise the producer is
 * preferred (it likely has the engine images cached) with any online agent as
 * a fallback.
 */
export async function enqueueDrill(
  snapshotId: string,
  trigger: "manual" | "scheduled" | "api" = "manual",
): Promise<{ drillId: string; jobId: string }> {
  const snapshot = await prisma.snapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: { destination: true },
  });
  if (snapshot.status !== "succeeded") throw new UserError("messages.drillNeedsSuccess");
  if (!snapshot.manifest) throw new UserError("messages.noManifestDrill");

  const producer = await agentById(snapshot.agentId);
  const producerOnline = producer?.status === "online" ? producer : null;
  const agent = snapshot.destination.type === "local" ? producerOnline : (producerOnline ?? (await anyOnlineAgent()));
  if (!agent) {
    throw new UserError(
      snapshot.destination.type === "local" ? "messages.drillLocalAgentOffline" : "messages.drillNoAgent",
    );
  }

  const manifest = snapshot.manifest as unknown as SnapshotManifest;
  const enc = resolveEncryption(snapshot.destination);
  const cfg = manifest.capturedConfig;
  const rawImage = cfg?.kind === "database" ? (cfg.raw as Record<string, unknown> | undefined)?.image : undefined;

  // The drill row exists before its job becomes claimable, so a fast agent's
  // result always finds it.
  const jobId = newJobId();
  const drill = await prisma.restoreDrill.create({
    data: { snapshotId: snapshot.id, agentJobId: jobId, trigger },
  });

  const job: RestoreDrillJob = {
    id: jobId,
    type: "restore-drill",
    source: resolveDestination(snapshot.destination),
    storage: resolveStorage(snapshot.destination),
    dir: snapshot.destinationDir,
    resticSnapshotId: snapshot.resticSnapshotId ?? undefined,
    decryptionKey: enc.enabled ? enc.key : undefined,
    dbImage: typeof rawImage === "string" ? rawImage : undefined,
    manifest,
  };
  // snapshotId links the job to its resource for labels (activity bar, API);
  // the result route dispatches on type, so it's never treated as the backup.
  await createAgentJob({ id: jobId, agentId: agent.id, type: "restore-drill", payload: job, snapshotId: snapshot.id });
  return { drillId: drill.id, jobId };
}
