import { prisma } from "./prisma";
import { enqueueMirror } from "./jobs";

/**
 * Mirror copies that didn't happen. A copy is queued when a backup succeeds;
 * one that failed, or that couldn't be queued (no agent online then), used to
 * be forgotten - the second copy silently missing. Each resource's newest
 * backup on a mirrored destination gets its copy retried here, a few times,
 * each failure alerting (see the job result route).
 */

/** Copies tried for one backup before giving up (the last failure says so). */
export const MIRROR_ATTEMPTS = 3;
/** How far back a backup still gets its missing copy. */
export const MIRROR_CATCHUP_DAYS = 7;

export type MirrorJobState = { sourceSnapshotId: string; status: string };

/**
 * Which backups to copy now: of the candidates (newest first), the newest of
 * each resource when it has no copy yet, unless one is already queued or
 * running, or failed MIRROR_ATTEMPTS times. An older backup isn't copied when a
 * newer one exists: what matters is a recent second copy.
 */
export function mirrorsToQueue(
  candidates: Array<{ id: string; resourceId: string; copied: boolean }>,
  jobs: MirrorJobState[],
): string[] {
  const active = new Set(jobs.filter((j) => j.status === "queued" || j.status === "running").map((j) => j.sourceSnapshotId));
  const failed = new Map<string, number>();
  for (const j of jobs) if (j.status === "failed") failed.set(j.sourceSnapshotId, (failed.get(j.sourceSnapshotId) ?? 0) + 1);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (seen.has(c.resourceId)) continue;
    seen.add(c.resourceId);
    if (c.copied || active.has(c.id) || (failed.get(c.id) ?? 0) >= MIRROR_ATTEMPTS) continue;
    out.push(c.id);
  }
  return out;
}

/** The mirror jobs of the last days, by the backup they copy. */
export async function recentMirrorJobs(since: Date): Promise<MirrorJobState[]> {
  const jobs = await prisma.agentJob.findMany({
    where: { type: "mirror", createdAt: { gte: since } },
    select: { status: true, payload: true },
  });
  const out: MirrorJobState[] = [];
  for (const j of jobs) {
    const source = (j.payload as { sourceSnapshotId?: unknown } | null)?.sourceSnapshotId;
    if (typeof source === "string") out.push({ sourceSnapshotId: source, status: j.status });
  }
  return out;
}

/** Failed copies of one backup so far. */
export async function mirrorFailures(sourceSnapshotId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - (MIRROR_CATCHUP_DAYS + 1) * 86_400_000);
  return (await recentMirrorJobs(since)).filter((j) => j.sourceSnapshotId === sourceSnapshotId && j.status === "failed")
    .length;
}

/** Queue the missing copies (hourly from the scheduler). Returns how many. */
export async function catchUpMirrors(now: Date): Promise<number> {
  const dests = await prisma.destination.findMany({ where: { mirrorToId: { not: null } }, select: { id: true } });
  if (dests.length === 0) return 0;
  const since = new Date(now.getTime() - MIRROR_CATCHUP_DAYS * 86_400_000);
  const jobs = await recentMirrorJobs(new Date(since.getTime() - 86_400_000));
  let queued = 0;
  for (const d of dests) {
    const candidates = await prisma.snapshot.findMany({
      where: {
        destinationId: d.id,
        isMirror: false,
        status: "succeeded",
        startedAt: { gte: since },
      },
      orderBy: { startedAt: "desc" },
      select: { id: true, resourceId: true, _count: { select: { mirrors: true } } },
    });
    const list = candidates.map((c) => ({ id: c.id, resourceId: c.resourceId, copied: c._count.mirrors > 0 }));
    for (const id of mirrorsToQueue(list, jobs)) {
      const res = await enqueueMirror(id).catch((e) => {
        console.error(`[mirror] catch-up for ${id} failed:`, (e as Error).message);
        return { queued: false };
      });
      if (res.queued) queued++;
    }
  }
  return queued;
}
