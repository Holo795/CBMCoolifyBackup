import { z } from "zod";
import { ArtifactKind, EventLevel, JobStatus, JobType, PolicyMode, ResourceType } from "./enums.js";

/* ------------------------------------------------------------------ *
 * Destination (resolved config sent to the agent for a single job)    *
 * ------------------------------------------------------------------ */

export const LocalDestination = z.object({
  type: z.literal("local"),
  basePath: z.string().min(1),
});

export const SshDestination = z.object({
  type: z.literal("ssh"),
  host: z.string().min(1),
  port: z.number().int().positive().default(22),
  username: z.string().min(1),
  basePath: z.string().min(1),
  // Exactly one auth method is provided at job time.
  password: z.string().optional(),
  privateKey: z.string().optional(),
  // Optional jump host (bastion): the agent connects here first, then tunnels to
  // `host` above. Auth falls back to the target's key/password when omitted.
  jumpHost: z.string().optional(),
  jumpPort: z.number().int().positive().default(22),
  jumpUsername: z.string().optional(),
  jumpPassword: z.string().optional(),
  jumpPrivateKey: z.string().optional(),
});

export const S3Destination = z.object({
  type: z.literal("s3"),
  endpoint: z.string().optional(), // for S3-compatible (MinIO, etc.)
  region: z.string().default("us-east-1"),
  bucket: z.string().min(1),
  prefix: z.string().default(""),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean().default(false),
});

export const ResolvedDestination = z.discriminatedUnion("type", [
  LocalDestination,
  SshDestination,
  S3Destination,
]);
export type ResolvedDestination = z.infer<typeof ResolvedDestination>;

/**
 * How artifacts are stored at the destination:
 *  - "tar"   : one archive/dump file per artifact (default, all destination types).
 *  - "restic": an incremental, deduplicated, encrypted restic repository — the
 *    agent stages artifacts then `restic backup`s them; only changed data is
 *    uploaded. `resticPassword` unlocks the repo. (local & s3 destinations.)
 */
export const StorageSpec = z.object({
  engine: z.enum(["tar", "restic"]).default("tar"),
  resticPassword: z.string().optional(),
});
export type StorageSpec = z.infer<typeof StorageSpec>;

/* ------------------------------------------------------------------ *
 * Encryption                                                          *
 * ------------------------------------------------------------------ */

export const EncryptionSpec = z.object({
  enabled: z.boolean(),
  /** Base64-encoded 32-byte symmetric key (AES-256-GCM) when enabled. */
  key: z.string().optional(),
});
export type EncryptionSpec = z.infer<typeof EncryptionSpec>;

/* ------------------------------------------------------------------ *
 * Resource descriptor (what the agent needs to act on a resource)     *
 * ------------------------------------------------------------------ */

export const DbCredentials = z.object({
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
});
export type DbCredentials = z.infer<typeof DbCredentials>;

export const ResourceDescriptor = z.object({
  coolifyUuid: z.string(),
  name: z.string(),
  type: ResourceType,
  /** Primary container name (or compose project) on the Docker host. */
  containerName: z.string().optional(),
  /** All containers belonging to this resource (compose/service). */
  containerNames: z.array(z.string()).default([]),
  /** Docker volumes belonging to this resource. */
  volumes: z.array(z.string()).default([]),
  /** Host-path (bind) mounts holding data, with the container that mounts them. */
  bindMounts: z.array(z.object({ source: z.string(), container: z.string() })).default([]),
  /** Credentials for logical dumps (hot mode). */
  db: DbCredentials.optional(),
});
export type ResourceDescriptor = z.infer<typeof ResourceDescriptor>;

/* ------------------------------------------------------------------ *
 * Artifacts & Snapshot manifest                                       *
 * ------------------------------------------------------------------ */

export const Artifact = z.object({
  kind: ArtifactKind,
  /** File name as stored at the destination (relative to the snapshot dir). */
  filename: z.string(),
  sizeBytes: z.number().int().nonnegative().default(0),
  sha256: z.string().optional(),
  encrypted: z.boolean().default(false),
  /** For db-dump: the engine used. For volume: the volume name. */
  meta: z.record(z.string(), z.string()).default({}),
});
export type Artifact = z.infer<typeof Artifact>;

/**
 * restic engine: artifact meta key naming the restic snapshot that holds this
 * artifact on its own - a volume streamed straight into the repository (copy
 * mode auto/direct) is a separate restic snapshot (`restic backup --stdin`),
 * stored as `/<filename>`. Without it, the artifact is in the snapshot's main
 * restic snapshot with the rest of the staging directory.
 */
export const RESTIC_PART_META = "resticSnapshotId";

/** The extra restic snapshots ("parts") a manifest's artifacts live in. */
export function resticPartIds(manifest: { artifacts?: Array<{ meta?: Record<string, string> }> } | null | undefined): string[] {
  const ids = (manifest?.artifacts ?? []).map((a) => a.meta?.[RESTIC_PART_META]).filter((x): x is string => !!x);
  return [...new Set(ids)];
}

/** The image one container of the resource ran when it was backed up. */
export const ImageProvenance = z.object({
  container: z.string().optional(),
  /** Its docker compose service (a service's containers, a compose app). */
  service: z.string().optional(),
  /** The image as written in Coolify ("gitlab/gitlab-ce:latest"). */
  ref: z.string(),
  /** Pullable digest of that exact image ("gitlab/gitlab-ce@sha256:..."), when
   * it came from a registry (an image Coolify built from git has none). */
  digest: z.string().optional(),
  /** Local image id ("sha256:..."): tells whether the container still runs it. */
  id: z.string().optional(),
  /** Human-readable version, when the image declares one ("18.2.0-ce.0"). */
  version: z.string().optional(),
});
export type ImageProvenance = z.infer<typeof ImageProvenance>;

/** Git/image provenance captured by the agent via `docker inspect`. */
export const Provenance = z.object({
  gitCommitSha: z.string().optional(),
  /** The primary container's image (kept for snapshots taken before 2.4.6). */
  imageRef: z.string().optional(),
  imageDigest: z.string().optional(),
  /** Every container of the resource (2.4.6+). */
  images: z.array(ImageProvenance).max(50).optional(),
});
export type Provenance = z.infer<typeof Provenance>;

/**
 * Full Coolify resource definition captured at backup time, so a snapshot can
 * be recreated on a fresh Coolify even after the source instance is gone
 * (disaster recovery / migration). Captured by the controller (the agent stores
 * it verbatim — it can't read the encrypted parts):
 *  - `raw` is a whitelisted, non-secret subset of the Coolify API object —
 *    exactly the fields the clone builders read (git/build-pack/image fields
 *    for apps, `image` for databases, `service_type` for services).
 *  - Credential-bearing db fields and the compose YAML (which may inline
 *    secrets) are master-key-encrypted in `dbCredsEnc` / `composeEnc`.
 */
export const CapturedConfig = z.object({
  version: z.literal(1).default(1),
  kind: z.enum(["application", "service", "database"]),
  projectName: z.string(),
  environmentName: z.string().default("production"),
  /** The source server this resource ran on — a remap hint, not a requirement. */
  serverUuid: z.string().optional(),
  serverName: z.string().optional(),
  /** Source-side versions, to warn about API drift at a much-later restore. */
  coolifyVersion: z.string().optional(),
  cbmVersion: z.string().optional(),
  /** Domain(s) configured on the source (informational for the operator). */
  fqdn: z.string().optional(),
  /** Whitelisted non-secret Coolify fields (see above). */
  raw: z.record(z.string(), z.unknown()).default({}),
  /** Master-key-encrypted JSON of the per-engine db credential fields. */
  dbCredsEnc: z.string().optional(),
  /** Master-key-encrypted compose YAML (services; may contain inline secrets). */
  composeEnc: z.string().optional(),
  /** Git-auth remap hints: numeric ids are meaningless on a new Coolify. */
  gitSourceName: z.string().optional(),
  privateKeyName: z.string().optional(),
});
export type CapturedConfig = z.infer<typeof CapturedConfig>;

export const SnapshotManifest = z.object({
  version: z.literal(1).default(1),
  resource: ResourceDescriptor,
  mode: PolicyMode,
  /** How it was captured, for display: "dump" | "frozen" | "live" | … */
  captureMode: z.string(),
  capturedAt: z.string(), // ISO timestamp, stamped by controller/agent
  artifacts: z.array(Artifact).default([]),
  provenance: Provenance.default({}),
  /** Encrypted env vars blob filename (config artifact holds compose/config). */
  envArtifact: z.string().optional(),
  /** The resource's env vars (master-key-encrypted JSON), so the snapshot can be
   * restored even if the original resource no longer exists in Coolify. */
  envEnc: z.string().optional(),
  /** Full resource definition captured at backup time (see CapturedConfig), so
   * a restore can rebuild the resource on a fresh Coolify without the source. */
  capturedConfig: CapturedConfig.optional(),
  encrypted: z.boolean().default(false),
  /** Relative directory at the destination that holds this snapshot. */
  destinationDir: z.string(),
  /** restic snapshot id when stored via the restic engine. */
  resticSnapshotId: z.string().optional(),
  /** Paths left out of the volume copies (see normalizeExcludes): a restore in
   * place leaves them as they are. */
  excludes: z.array(z.string()).optional(),
  /** What went wrong without failing the backup (a database that couldn't be
   * dumped...): the snapshot is shown "with warnings". */
  warnings: z.array(z.string().max(1000)).max(50).optional(),
  notes: z.string().optional(),
});
export type SnapshotManifest = z.infer<typeof SnapshotManifest>;

/**
 * Paths left out of a resource's volume and host-folder copies (and left as
 * they are by a restore in place). Each is either `/path` - from the root of
 * every volume or folder of the resource - or a bare name (no slash) matched at
 * any depth; `*` and `?` wildcards work. E.g. `/backups`, `/logs`, `*.tmp`.
 */
export const MAX_EXCLUDES = 50;
export function excludeError(raw: string): string | null {
  const p = raw.trim().replace(/\/+$/, "");
  if (!p || p === "/") return "empty";
  if (p.length > 200) return "too long";
  if (/[\n\r\0\\]/.test(p)) return "invalid character";
  if (p.startsWith("/")) {
    if (p.split("/").some((seg) => seg === ".." || seg === ".")) return "no . or .. segments";
  } else if (p.includes("/")) {
    return "use /path from the root, or a bare name";
  } else if (p === ".." || p === ".") {
    return "no . or ..";
  }
  return null;
}
/** Normalised exclusions (trimmed, no trailing slash, de-duplicated); throws on an invalid one. */
export function normalizeExcludes(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    if (!r.trim()) continue;
    const err = excludeError(r);
    if (err) throw new Error(`Invalid exclusion "${r.trim()}": ${err}`);
    const p = r.trim().replace(/\/+$/, "");
    if (!out.includes(p)) out.push(p);
  }
  if (out.length > MAX_EXCLUDES) throw new Error(`At most ${MAX_EXCLUDES} exclusions`);
  return out;
}

/**
 * A private key as OpenSSH reads it: LF line ends and a final newline. A key
 * pasted in a form arrives with CRLF (multipart/form-data turns every line
 * break of a textarea into \r\n); ssh2 shrugs it off, but `ssh -i` then fails
 * with "error in libcrypto: unsupported".
 */
export function normalizePrivateKey(key: string): string;
export function normalizePrivateKey(key: string | undefined): string | undefined;
export function normalizePrivateKey(key: string | undefined): string | undefined {
  if (!key) return key;
  const k = key.replace(/\r\n?/g, "\n").trim();
  return k ? `${k}\n` : undefined;
}

/* ------------------------------------------------------------------ *
 * Jobs (controller -> agent)                                          *
 * ------------------------------------------------------------------ */

export const BackupJob = z.object({
  id: z.string(),
  type: z.literal("backup"),
  mode: PolicyMode,
  /** When true, copy volumes live without ever freezing a container (at the
   * operator's risk of inconsistency). Default: freeze RW containers briefly. */
  liveBackup: z.boolean().default(false),
  /** The resource's environment variables, JSON then master-key-encrypted by the
   * controller. The agent stores it verbatim in the manifest (it can't read it),
   * so a backup is self-contained for a later restore. */
  envEnc: z.string().optional(),
  /** Full resource definition captured by the controller (see CapturedConfig).
   * The agent stores it verbatim in the manifest. */
  capturedConfig: CapturedConfig.optional(),
  /** Set when the controller couldn't read the resource's environment or
   * definition from Coolify: the snapshot then can't recreate them. The agent
   * logs it, and fails a configuration-only backup (that is all it would keep). */
  configCaptureError: z.string().optional(),
  /** Paths left out of the volume and host-folder copies (see normalizeExcludes). */
  excludes: z.array(z.string()).default([]),
  resource: ResourceDescriptor,
  destination: ResolvedDestination,
  encryption: EncryptionSpec,
  storage: StorageSpec.default({ engine: "tar" }),
  /** Optional pre/post commands per target. `container` "" → the resource's
   * primary container; otherwise a docker compose service name (stable across
   * redeploys) or an exact container name. A target that matches no container is
   * skipped, never redirected elsewhere. Pre runs before capture (a failure or
   * timeout aborts), post always runs after, in reverse order. */
  hooks: z
    .array(
      z.object({
        container: z.string().default(""),
        pre: z.string().optional(),
        post: z.string().optional(),
        /** Per-command time limit in seconds (default 300). */
        timeoutSec: z.number().int().min(1).max(3600).optional(),
      }),
    )
    .optional(),
  /** Relative directory to write into (controller decides naming). */
  destinationDir: z.string(),
});
export type BackupJob = z.infer<typeof BackupJob>;

export const RestoreJob = z.object({
  id: z.string(),
  type: z.literal("restore"),
  manifest: SnapshotManifest,
  source: ResolvedDestination,
  storage: StorageSpec.default({ engine: "tar" }),
  /** restic snapshot id to restore from (restic engine). */
  resticSnapshotId: z.string().optional(),
  /** Base64 AES-256-GCM key when artifacts are encrypted. */
  decryptionKey: z.string().optional(),
  target: z.enum(["in_place", "new_resource"]).default("in_place"),
  /** When restoring DB dumps, the target container to exec into. */
  targetContainerName: z.string().optional(),
  db: DbCredentials.optional(),
  /**
   * For target=new_resource: the freshly-cloned Coolify resource the agent
   * should restore INTO (resolved from its uuid on the live host), instead of
   * the snapshot's original resource. The original is never touched.
   */
  targetResource: ResourceDescriptor.optional(),
  /**
   * For target=new_resource with volumes: maps each original docker volume name
   * to the clone's volume name (derived by swapping the resource uuid). The
   * agent pre-creates + fills the target volume so data is present on first
   * deploy. Volumes with no mapping are skipped (the original is never touched).
   */
  volumeMap: z.record(z.string(), z.string()).optional(),
  /**
   * In place: false leaves the containers stopped after a successful restore,
   * because the controller then redeploys them on the snapshot's image version
   * (they must not start the newer version on the restored data first). They
   * are restarted as usual when the restore fails. Default: restart.
   */
  restart: z.boolean().optional(),
});
export type RestoreJob = z.infer<typeof RestoreJob>;

export const PruneJob = z.object({
  id: z.string(),
  type: z.literal("prune"),
  destination: ResolvedDestination,
  storage: StorageSpec.default({ engine: "tar" }),
  /** Relative directories at the destination to delete recursively (tar engine). */
  dirs: z.array(z.string()),
  /** For the restic engine: forget snapshots by restic snapshot id (main and
   * part snapshots, see RESTIC_PART_META), then prune. */
  resticSnapshotIds: z.array(z.string()).optional(),
});
export type PruneJob = z.infer<typeof PruneJob>;

export const VerifyDestinationJob = z.object({
  id: z.string(),
  type: z.literal("verify-destination"),
  destination: ResolvedDestination,
  storage: StorageSpec.default({ engine: "tar" }),
  /** Snapshot directories whose files should still be present at the destination
   * (tar engine). The agent reports which are present vs missing. */
  dirs: z.array(z.string()),
  /** For the restic engine: the restic snapshot ids (main and parts) to confirm still exist. The
   * agent reports the present/missing sets using these ids as the keys. */
  resticSnapshotIds: z.array(z.string()).optional(),
  /** For the restic engine: resources (Coolify uuids, tagged `res:<uuid>` on
   * their snapshots) whose real size in the repository to measure, with the
   * repository's own. Reported in the result's `usage`. */
  usageTags: z.array(z.string()).optional(),
  /** Deep integrity check (not just presence): tar re-downloads each artifact and
   * compares its sha256 to the manifest; restic runs `restic check`. Expensive,
   * so it's opt-in per destination and scheduled less often than reconciliation. */
  deep: z.boolean().default(false),
  /** restic deep check: percentage of pack data to actually re-read and hash,
   * e.g. "5%" (sampling) or "100%". Omitted = structure/metadata check only. */
  readDataSubset: z.string().optional(),
  /** tar deep check: base64 AES-256-GCM key to decrypt encrypted artifacts. The
   * GCM auth tag itself proves integrity; for plaintext artifacts the sha256 is
   * compared to the manifest instead. */
  decryptionKey: z.string().optional(),
});
export type VerifyDestinationJob = z.infer<typeof VerifyDestinationJob>;

/**
 * Copy one snapshot from a source destination to a mirror destination, for a
 * second independent copy (redundancy). tar copies the snapshot directory
 * file-for-file; restic `copy`s the snapshot into the mirror repository. The new
 * restic snapshot id in the target is returned in JobResult.resticSnapshotId.
 */
export const MirrorJob = z.object({
  id: z.string(),
  type: z.literal("mirror"),
  source: ResolvedDestination,
  target: ResolvedDestination,
  sourceStorage: StorageSpec.default({ engine: "tar" }),
  targetStorage: StorageSpec.default({ engine: "tar" }),
  /** tar: the snapshot directory (same path is reused on the target). */
  dir: z.string().optional(),
  /** restic: the source snapshot id to copy into the target repository. */
  resticSnapshotId: z.string().optional(),
  /** Base64 AES key of the SOURCE (tar) to stage artifacts back to plaintext. */
  sourceEncryptionKey: z.string().optional(),
  /** Base64 AES key of the TARGET (tar) to re-encrypt the copy, so the mirror is
   * a first-class snapshot under the target's own crypto. */
  targetEncryptionKey: z.string().optional(),
  /** The source snapshot's manifest; the agent rebuilds it for the target copy. */
  manifest: SnapshotManifest,
});
export type MirrorJob = z.infer<typeof MirrorJob>;

/**
 * Restore drill: prove a snapshot is actually restorable WITHOUT touching
 * Coolify. The agent stages the artifacts back to plaintext, then restores them
 * into a throwaway sandbox (databases: a network-less container of the same
 * engine; volumes: a full archive read) and removes everything afterwards.
 */
export const RestoreDrillJob = z.object({
  id: z.string(),
  type: z.literal("restore-drill"),
  source: ResolvedDestination,
  storage: StorageSpec.default({ engine: "tar" }),
  /** tar: the snapshot directory. */
  dir: z.string().optional(),
  /** restic: the snapshot id to restore. */
  resticSnapshotId: z.string().optional(),
  /** Base64 AES key (tar) to decrypt encrypted artifacts. */
  decryptionKey: z.string().optional(),
  /** Image of the resource's own database (captured config), used when a dump
   * artifact doesn't record its image. */
  dbImage: z.string().optional(),
  manifest: SnapshotManifest,
});
export type RestoreDrillJob = z.infer<typeof RestoreDrillJob>;

/** One verified artifact in a restore drill. */
export const DrillCheck = z.object({
  artifact: z.string(),
  kind: z.string(),
  engine: z.string().optional(),
  ok: z.boolean(),
  /** Human-readable outcome, e.g. "restored 12/12 tables" or the failure. */
  detail: z.string(),
});
export type DrillCheck = z.infer<typeof DrillCheck>;

export const Job = z.discriminatedUnion("type", [
  BackupJob,
  RestoreJob,
  PruneJob,
  VerifyDestinationJob,
  MirrorJob,
  RestoreDrillJob,
]);
export type Job = z.infer<typeof Job>;

/* ------------------------------------------------------------------ *
 * Agent <-> controller messages                                       *
 * ------------------------------------------------------------------ */

export const AgentRegisterRequest = z.object({
  // Per-instance enrollment token: authenticates the agent AND identifies which
  // Coolify instance it serves (zero-config auto-link).
  enrollmentToken: z.string().min(1),
  hostname: z.string().min(1),
  agentVersion: z.string().default("0.1.0"),
  /** Optional install-time override (AGENT_SERVER_UUID): pins this agent to a
   * Coolify server, disabling auto-detection. */
  serverUuid: z.string().optional(),
});
export type AgentRegisterRequest = z.infer<typeof AgentRegisterRequest>;

export const AgentRegisterResponse = z.object({
  agentId: z.string(),
  agentToken: z.string(),
});
export type AgentRegisterResponse = z.infer<typeof AgentRegisterResponse>;

/** A container the agent sees for a resource, with its docker compose service
 * name when it has one (that name survives redeploys; the container name may not). */
export const DiscoveredContainer = z.object({
  name: z.string(),
  service: z.string().optional(),
  /** Local id of the image it runs (compared with a snapshot's before an in-place restore). */
  imageId: z.string().optional(),
});
export type DiscoveredContainer = z.infer<typeof DiscoveredContainer>;

/* ------------------------------------------------------------------ *
 * Agent settings (set in CBM, sent with each heartbeat answer)        *
 * ------------------------------------------------------------------ */

/**
 * Where a volume copy goes before reaching the destination:
 *  - "auto"  : on the agent host when it fits (short freeze), else straight to
 *              the destination (the freeze lasts the upload);
 *  - "local" : always on the host (fails cleanly when it doesn't fit);
 *  - "direct": always straight to the destination.
 * With restic, "straight to the destination" is a separate restic snapshot fed
 * the tar stream (see RESTIC_PART_META).
 */
export const StagingMode = z.enum(["auto", "local", "direct"]);
export type StagingMode = z.infer<typeof StagingMode>;

/**
 * How containers are frozen during a copy: "pause" (`docker pause`; Docker then
 * reports them unhealthy until their next health check, so a proxy such as
 * Coolify's Traefik may stop routing to them for that long) or "cgroup" (the
 * same kernel freezer, without telling Docker: they stay healthy).
 */
export const FreezeMethod = z.enum(["pause", "cgroup"]);
export type FreezeMethod = z.infer<typeof FreezeMethod>;

export const AgentLogLevel = z.enum(["debug", "info", "warn", "error"]);
export type AgentLogLevel = z.infer<typeof AgentLogLevel>;

export const AgentSettings = z.object({
  /** Jobs run at once (AGENT_CONCURRENCY). */
  concurrency: z.number().int().min(1).max(16).optional(),
  /** Space always left free on the host's work dir (AGENT_MIN_FREE_MB). */
  minFreeMb: z.number().int().min(0).max(10_000_000).optional(),
  /** See StagingMode (AGENT_STAGING_MODE). */
  stagingMode: StagingMode.optional(),
  /** Agent log verbosity (LOG_LEVEL). */
  logLevel: AgentLogLevel.optional(),
  /** Files restic reads at once (RESTIC_READ_CONCURRENCY, restic's own variable):
   * higher suits fast disks (NVMe). */
  resticReadConcurrency: z.number().int().min(1).max(32).optional(),
  /** Size of the packs restic writes, in MiB (RESTIC_PACK_SIZE): bigger means
   * fewer files on a remote (SFTP, S3), at the cost of memory. */
  resticPackSize: z.number().int().min(4).max(128).optional(),
  /** See FreezeMethod (AGENT_FREEZE_METHOD). */
  freezeMethod: FreezeMethod.optional(),
});
export type AgentSettings = z.infer<typeof AgentSettings>;
export const AgentSettingKey = z.enum([
  "concurrency",
  "minFreeMb",
  "stagingMode",
  "logLevel",
  "resticReadConcurrency",
  "resticPackSize",
  "freezeMethod",
]);
export type AgentSettingKey = z.infer<typeof AgentSettingKey>;

/** Built-in values, used when neither CBM nor the host sets one. */
export const AGENT_SETTING_DEFAULTS: Required<AgentSettings> = {
  concurrency: 2,
  minFreeMb: 1024,
  stagingMode: "auto",
  logLevel: "info",
  // restic's own defaults.
  resticReadConcurrency: 2,
  resticPackSize: 16,
  freezeMethod: "pause",
};

/** The host environment variable behind each setting (it wins over CBM). */
export const AGENT_SETTING_ENV: Record<AgentSettingKey, string> = {
  concurrency: "AGENT_CONCURRENCY",
  minFreeMb: "AGENT_MIN_FREE_MB",
  stagingMode: "AGENT_STAGING_MODE",
  logLevel: "LOG_LEVEL",
  resticReadConcurrency: "RESTIC_READ_CONCURRENCY",
  resticPackSize: "RESTIC_PACK_SIZE",
  freezeMethod: "AGENT_FREEZE_METHOD",
};

export const HeartbeatRequest = z.object({
  dockerVersion: z.string().optional(),
  containers: z.number().int().nonnegative().optional(),
  /** Coolify resource UUIDs the agent can see on its local Docker host (from
   * volume/container names). The controller matches them to known resources to
   * auto-detect which server this agent backs up. */
  resourceUuids: z.array(z.string()).optional(),
  /** Containers per Coolify resource uuid on this host, so per-container hooks
   * can be configured before the first backup and stay current after redeploys. */
  resourceContainers: z.record(z.string(), z.array(DiscoveredContainer)).optional(),
  /** Jobs this agent process is running, or holds a result for in its outbox.
   * The controller fails any job it thinks the agent runs that isn't listed
   * (e.g. after an agent restart) instead of leaving it "running" for hours.
   * Absent (older agents): no such check. */
  activeJobIds: z.array(z.string()).max(1000).optional(),
  /** Settings fixed by an environment variable on the host (CBM can't change
   * them), and the values the agent actually runs with. */
  settingsLockedByEnv: z.array(AgentSettingKey).optional(),
  settingsInEffect: AgentSettings.optional(),
});
export type HeartbeatRequest = z.infer<typeof HeartbeatRequest>;

/** The controller's answer to a heartbeat: the settings this agent should use. */
export const HeartbeatResponse = z.object({
  ok: z.boolean(),
  /** Absent from older controllers: the agent keeps its own (env / defaults). */
  settings: AgentSettings.optional(),
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponse>;

/** Long-poll response: a job to run, or null when idle. */
export const PollResponse = z.object({
  job: Job.nullable(),
});
export type PollResponse = z.infer<typeof PollResponse>;

export const JobEvent = z.object({
  jobId: z.string(),
  ts: z.string(),
  level: EventLevel.default("info"),
  message: z.string(),
  progress: z.number().min(0).max(100).optional(),
});
export type JobEvent = z.infer<typeof JobEvent>;

export const JobResult = z.object({
  jobId: z.string(),
  status: JobStatus,
  manifest: SnapshotManifest.optional(),
  error: z.string().optional(),
  /** restic snapshot id created by a restic-engine backup (for forget/verify). */
  resticSnapshotId: z.string().optional(),
  /** For a verify-destination job: which snapshot dirs are still present vs gone,
   * plus (deep check) which are corrupt and any repo-level integrity error. */
  verify: z
    .object({
      present: z.array(z.string()).default([]),
      missing: z.array(z.string()).default([]),
      /** Deep check: snapshots whose stored content no longer matches its sha256
       * (tar engine, per-snapshot). */
      corrupt: z.array(z.string()).default([]),
      /** Deep check: a repo-level integrity failure (restic `check`), which isn't
       * attributable to a single snapshot. */
      integrityError: z.string().optional(),
      /** restic: bytes really stored (deduplicated, compressed) - the whole
       * repository, and what each measured resource's snapshots use (data
       * shared between resources counts for each). */
      usage: z
        .object({ repoBytes: z.number().nonnegative(), byTag: z.record(z.string(), z.number().nonnegative()).default({}) })
        .optional(),
    })
    .optional(),
  /** For a restore-drill job: the per-artifact outcome. */
  drill: z
    .object({
      ok: z.boolean(),
      checks: z.array(DrillCheck).default([]),
      durationMs: z.number().optional(),
    })
    .optional(),
});
export type JobResult = z.infer<typeof JobResult>;

/* Re-export job/status enums for convenience. */
export { JobType, JobStatus };
