/**
 * Plain-JSON serializers for the `/api/v1` programmatic surface. Kept in one
 * place so list and detail endpoints expose identical shapes and never leak a
 * secret (encrypted blobs, tokens, raw Coolify API tokens stay out). BigInt
 * sizes become strings so `JSON.stringify` is happy on any platform.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const big = (n: bigint | null | undefined) => (n == null ? null : n.toString());

export function serializeInstance(i: {
  id: string;
  name: string;
  baseUrl: string;
  createdAt: Date;
  lastSyncedAt: Date | null;
}) {
  return { id: i.id, name: i.name, baseUrl: i.baseUrl, createdAt: iso(i.createdAt), lastSyncedAt: iso(i.lastSyncedAt) };
}

export function serializeResource(r: {
  id: string;
  instanceId: string;
  coolifyUuid: string;
  name: string;
  type: string;
  projectName: string | null;
  environment: string | null;
  status: string | null;
  serverUuid: string | null;
  serverName: string | null;
  backupEnabled: boolean;
  liveBackup: boolean;
  instance?: { name: string } | null;
}) {
  return {
    id: r.id,
    instanceId: r.instanceId,
    instanceName: r.instance?.name ?? null,
    coolifyUuid: r.coolifyUuid,
    name: r.name,
    type: r.type,
    projectName: r.projectName,
    environment: r.environment,
    status: r.status,
    serverUuid: r.serverUuid,
    serverName: r.serverName,
    backupEnabled: r.backupEnabled,
    liveBackup: r.liveBackup,
  };
}

export function serializeSnapshot(s: {
  id: string;
  resourceId: string;
  destinationId: string;
  mode: string;
  captureMode: string;
  status: string;
  sizeBytes: bigint;
  error: string | null;
  runId: string | null;
  resticSnapshotId: string | null;
  mirrorOfId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  lastCheckedAt: Date | null;
  resource?: { name: string } | null;
  destination?: { name: string } | null;
  _count?: { artifacts: number };
}) {
  return {
    id: s.id,
    resourceId: s.resourceId,
    resourceName: s.resource?.name ?? null,
    destinationId: s.destinationId,
    destinationName: s.destination?.name ?? null,
    mode: s.mode,
    captureMode: s.captureMode,
    status: s.status,
    sizeBytes: big(s.sizeBytes),
    error: s.error,
    runId: s.runId,
    resticSnapshotId: s.resticSnapshotId,
    isMirror: s.mirrorOfId != null,
    artifactCount: s._count?.artifacts ?? null,
    startedAt: iso(s.startedAt),
    finishedAt: iso(s.finishedAt),
    lastCheckedAt: iso(s.lastCheckedAt),
  };
}

export function serializeDestination(d: {
  id: string;
  name: string;
  type: string;
  engine: string;
  encryptionEnabled: boolean;
  integrityCheckEnabled: boolean;
  lastIntegrityAt: Date | null;
  lastIntegrityStatus: string | null;
  mirrorToId: string | null;
}) {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    engine: d.engine,
    encryptionEnabled: d.encryptionEnabled,
    integrityCheckEnabled: d.integrityCheckEnabled,
    lastIntegrityAt: iso(d.lastIntegrityAt),
    lastIntegrityStatus: d.lastIntegrityStatus,
    mirrorToId: d.mirrorToId,
  };
}

export function serializeAgent(a: {
  id: string;
  hostname: string;
  instanceId: string | null;
  status: string;
  dockerVersion: string | null;
  containers: number | null;
  serverUuid: string | null;
  serverName: string | null;
  lastSeenAt: Date | null;
}) {
  return {
    id: a.id,
    hostname: a.hostname,
    instanceId: a.instanceId,
    status: a.status,
    dockerVersion: a.dockerVersion,
    containers: a.containers,
    serverUuid: a.serverUuid,
    serverName: a.serverName,
    lastSeenAt: iso(a.lastSeenAt),
  };
}

export function serializeJob(j: {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  label?: string | null;
  progress?: number | null;
  message?: string | null;
}) {
  return {
    id: j.id,
    type: j.type,
    status: j.status,
    label: j.label ?? null,
    progress: j.progress ?? null,
    message: j.message ?? null,
    error: j.error,
    createdAt: iso(j.createdAt),
    finishedAt: iso(j.finishedAt),
  };
}

export function serializeJobEvent(e: { level: string; message: string | null; progress: number | null; ts: Date }) {
  return { level: e.level, message: e.message, progress: e.progress, ts: iso(e.ts) };
}
