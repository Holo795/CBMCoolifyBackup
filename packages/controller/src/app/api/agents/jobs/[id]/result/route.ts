import { NextResponse } from "next/server";
import { JobResult, redactSecrets } from "@cbm/shared";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { authenticateAgentFromRequest } from "@/lib/agent-auth";
import {
  notifyBackupFailed,
  notifyMissingBackups,
  notifyCorruptBackups,
  notifyIntegrityFailure,
  notifyDrillFailed,
} from "@/lib/notify";
import { enqueueMirror, redeployOnSnapshotVersion } from "@/lib/jobs";
import { scrubPayload } from "@/lib/scrub";
import { removeSnapshots, settlePrune } from "@/lib/snapshot-removal";
import { resticPartIds } from "@cbm/shared";
import { applyRetention, applyMirrorRetention } from "@/lib/retention";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgentFromRequest(req);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const job = await prisma.agentJob.findUnique({ where: { id } });
  if (!job || job.agentId !== agent.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Idempotent: an agent resends a result it couldn't deliver. A job that is
  // already settled is acknowledged without being processed again - except one
  // the reaper failed (agent offline / time limit / never picked up), which the
  // real result may still correct (e.g. a backup that did finish during an outage).
  const reaped = job.status === "failed" && /went offline|time limit|picked this job up/.test(job.error ?? "");
  if (job.status !== "running" && !reaped) return NextResponse.json({ ok: true, duplicate: true });

  const parsed = JobResult.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid result", details: parsed.error.issues }, { status: 400 });
  }
  // Redact free text from the agent (an older agent may still echo credentials).
  const result = { ...parsed.data, error: parsed.data.error ? redactSecrets(parsed.data.error) : undefined };
  const succeeded = result.status === "succeeded";

  await prisma.agentJob.update({
    where: { id },
    data: { status: result.status, error: result.error, finishedAt: new Date() },
  });

  if (job.type === "backup" && job.snapshotId) {
    if (succeeded && result.manifest) {
      const m = result.manifest;
      const totalSize = m.artifacts.reduce((acc, a) => acc + (a.sizeBytes ?? 0), 0);
      // A late result for a reaped job may follow a partial earlier write.
      await prisma.artifact.deleteMany({ where: { snapshotId: job.snapshotId } });
      const done = await prisma.snapshot.update({
        where: { id: job.snapshotId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          manifest: m as unknown as object,
          // The agent's manifest is authoritative for how it actually captured
          // (e.g. a Redis resource dumped logically, not frozen).
          captureMode: m.captureMode,
          resticSnapshotId: result.resticSnapshotId ?? m.resticSnapshotId ?? undefined,
          resticPartIds: resticPartIds(m),
          sizeBytes: BigInt(totalSize),
          artifacts: {
            create: m.artifacts.map((a) => ({
              kind: a.kind,
              filename: a.filename,
              sizeBytes: BigInt(a.sizeBytes ?? 0),
              sha256: a.sha256,
              encrypted: a.encrypted,
            })),
          },
        },
      });
      // Cache docker facts the agent resolved (containers/volumes).
      await prisma.resource
        .updateMany({
          where: { coolifyUuid: m.resource.coolifyUuid },
          data: {
            containerName: m.resource.containerName ?? undefined,
            containerNames: m.resource.containerNames,
            volumes: m.resource.volumes,
          },
        })
        .catch(() => undefined);
      // If the destination mirrors to a second one, copy this backup there too.
      await enqueueMirror(job.snapshotId).catch((e) => console.error("[mirror] enqueue failed:", (e as Error).message));
      // Sync keeps ONE copy: the new one is verified and stored, so the older
      // copies of this resource on this destination go now (never before).
      if (done.mode === "sync") {
        const older = await prisma.snapshot.findMany({
          where: {
            resourceId: done.resourceId,
            destinationId: done.destinationId,
            mode: "sync",
            isMirror: false,
            id: { not: done.id },
            status: { notIn: ["running", "deleting"] },
          },
          select: { id: true },
        });
        if (older.length > 0) {
          await removeSnapshots(
            older.map((o) => o.id),
            "follow",
          ).catch((e) =>
            console.error("[sync] removing the previous copy failed:", (e as Error).message),
          );
        }
      } else if (done.policyId) {
        // Retention counts this backup now that it exists (the scheduler's own
        // pass runs when it queues a backup, i.e. one run late).
        await applyRetention(done.policyId).catch((e) =>
          console.error("[retention] failed:", (e as Error).message),
        );
      }
    } else if (result.status === "skipped") {
      // Nothing on the host to back up - a clear "ignored" outcome, not a failure
      // (no alert).
      await prisma.snapshot.update({
        where: { id: job.snapshotId },
        // Nothing was captured: drop the capture mode guessed when it was queued.
        data: {
          status: "skipped",
          captureMode: "none",
          finishedAt: new Date(),
          error: result.error ?? "Ignored: nothing on the host",
        },
      });
    } else {
      await prisma.snapshot.update({
        where: { id: job.snapshotId },
        data: { status: "failed", finishedAt: new Date(), error: result.error ?? "unknown error" },
      });
      await notifyBackupFailed(job.snapshotId).catch(() => undefined);
    }
  }

  if (job.type === "mirror") {
    const payload = job.payload as { sourceSnapshotId?: string; targetDestinationId?: string } | null;
    if (succeeded && result.manifest && payload?.sourceSnapshotId && payload.targetDestinationId) {
      const src = await prisma.snapshot.findUnique({ where: { id: payload.sourceSnapshotId } });
      // Only create the mirror row if it doesn't exist yet (idempotent re-delivery).
      const already = src
        ? await prisma.snapshot.findFirst({ where: { mirrorOfId: src.id }, select: { id: true } })
        : null;
      if (src && !already) {
        const m = result.manifest;
        const totalSize = m.artifacts.reduce((acc, a) => acc + (a.sizeBytes ?? 0), 0);
        await prisma.snapshot.create({
          data: {
            resourceId: src.resourceId,
            destinationId: payload.targetDestinationId,
            agentId: agent.id,
            mode: src.mode,
            captureMode: src.captureMode,
            status: "succeeded",
            destinationDir: src.destinationDir,
            manifest: m as unknown as object,
            sizeBytes: BigInt(totalSize),
            resticSnapshotId: result.resticSnapshotId ?? undefined,
            runId: src.runId,
            mirrorOfId: src.id,
            isMirror: true,
            // Dated like its source, so a mirror's own retention counts days of
            // capture, not of copying.
            startedAt: src.startedAt,
            finishedAt: new Date(),
            artifacts: {
              create: m.artifacts.map((a) => ({
                kind: a.kind,
                filename: a.filename,
                sizeBytes: BigInt(a.sizeBytes ?? 0),
                sha256: a.sha256,
                encrypted: a.encrypted,
              })),
            },
          },
        });
        // A mirror keeping its own retention trims its copies as they arrive.
        await applyMirrorRetention(payload.targetDestinationId).catch((e) =>
          console.error("[retention] mirror copies:", (e as Error).message),
        );
      }
    } else if (!succeeded) {
      console.error(`[mirror] job ${id} failed: ${result.error ?? "unknown error"}`);
    }
  }

  if (job.type === "restore" && job.restoreId) {
    let status = succeeded ? "succeeded" : "failed";
    let error = result.error;
    // The containers were left stopped: bring them back on the snapshot's version.
    const p = job.payload as { target?: string; restart?: boolean } | null;
    if (succeeded && p?.target === "in_place" && p.restart === false) {
      try {
        await redeployOnSnapshotVersion(job.restoreId, id);
      } catch (e) {
        status = "failed";
        error = `Data restored, but the redeploy on the snapshot's version failed (${(e as Error).message}): the containers are stopped, deploy the resource from Coolify`;
      }
    }
    await prisma.restoreJob.update({
      where: { id: job.restoreId },
      data: { status, error, finishedAt: new Date() },
    });
  }

  if (job.type === "prune") {
    // Rows removed only now that the files are gone (see lib/snapshot-removal).
    const ids = (job.payload as { snapshotIds?: string[] } | null)?.snapshotIds ?? [];
    await settlePrune(ids, succeeded, result.error);
  }

  if (job.type === "restore-drill") {
    // passed/failed = the drill ran and every check passed (or one didn't);
    // error = the drill itself couldn't run (staging, agent crash).
    const drill = result.drill;
    const status = !succeeded || !drill ? "error" : drill.ok ? "passed" : "failed";
    const updated = await prisma.restoreDrill
      .update({
        where: { agentJobId: id },
        data: {
          status,
          checks: drill ? (drill.checks as unknown as Prisma.InputJsonValue) : undefined,
          durationMs: drill?.durationMs != null ? Math.round(drill.durationMs) : undefined,
          error: status === "error" ? (result.error ?? "the drill did not complete") : null,
          finishedAt: new Date(),
        },
        select: { snapshotId: true },
      })
      .catch(() => null);
    if (updated && status !== "passed") {
      const failed = drill?.checks.filter((c) => !c.ok).map((c) => `${c.artifact}: ${c.detail}`) ?? [];
      await notifyDrillFailed(updated.snapshotId, failed.join("\n") || result.error || "the drill did not complete").catch(
        () => undefined,
      );
    }
  }

  if (job.type === "verify-destination" && result.verify) {
    const payload = job.payload as {
      destinationId?: string;
      engine?: string;
      isDeep?: boolean;
      usageScope?: string;
      usageResources?: Record<string, string[]>;
    } | null;
    const destinationId = payload?.destinationId;
    const isRestic = payload?.engine === "restic";
    const isDeep = !!payload?.isDeep;
    const now = new Date();
    const present = result.verify.present;
    const missing = result.verify.missing;
    const corrupt = result.verify.corrupt ?? [];
    const integrityError = result.verify.integrityError;
    // present/missing carry restic snapshot ids (restic engine: the main one
    // and those of volumes read in place) or snapshot directories (tar engine) -
    // match snapshots on the matching column(s).
    const match = (vals: string[]): Prisma.SnapshotWhereInput =>
      isRestic
        ? { OR: [{ resticSnapshotId: { in: vals } }, { resticPartIds: { hasSome: vals } }] }
        : { destinationDir: { in: vals } };
    if (destinationId) {
      if (present.length) {
        // Confirmed present (and, on a deep check, intact): refresh the check
        // time and un-flag any that had been missing/corrupt but recovered. A
        // restic snapshot is present only when none of its parts is missing.
        const whole: Prisma.SnapshotWhereInput = {
          destinationId,
          AND: [match(present), ...(missing.length ? [{ NOT: match(missing) }] : [])],
        };
        await prisma.snapshot.updateMany({ where: whole, data: { lastCheckedAt: now } });
        await prisma.snapshot.updateMany({
          where: { ...whole, status: { in: ["missing", "corrupt"] } },
          data: { status: "succeeded" },
        });
      }
      if (missing.length) {
        // Newly missing = not already flagged - alert only on these.
        const newly = await prisma.snapshot.findMany({
          where: { destinationId, ...match(missing), status: { not: "missing" } },
          select: { id: true },
        });
        await prisma.snapshot.updateMany({
          where: { destinationId, ...match(missing) },
          data: { status: "missing", lastCheckedAt: now },
        });
        if (newly.length) await notifyMissingBackups(newly.map((s) => s.id)).catch(() => undefined);
      }
      // Deep check: content corruption (tar, per-snapshot).
      if (corrupt.length) {
        const newly = await prisma.snapshot.findMany({
          where: { destinationId, ...match(corrupt), status: { not: "corrupt" } },
          select: { id: true },
        });
        await prisma.snapshot.updateMany({
          where: { destinationId, ...match(corrupt) },
          data: { status: "corrupt", lastCheckedAt: now },
        });
        if (newly.length) await notifyCorruptBackups(newly.map((s) => s.id)).catch(() => undefined);
      }
      // restic: what the repository - and each resource in it - really stores.
      const usage = result.verify.usage;
      if (usage) {
        const scope = payload?.usageScope ?? "";
        await prisma.repoUsage.upsert({
          where: { destinationId_scope: { destinationId, scope } },
          create: { destinationId, scope, bytes: BigInt(Math.round(usage.repoBytes)), measuredAt: now },
          update: { bytes: BigInt(Math.round(usage.repoBytes)), measuredAt: now },
        });
        for (const [uuid, bytes] of Object.entries(usage.byTag)) {
          for (const resourceId of payload?.usageResources?.[uuid] ?? []) {
            await prisma.resourceUsage.upsert({
              where: { resourceId_destinationId: { resourceId, destinationId } },
              create: { resourceId, destinationId, bytes: BigInt(Math.round(bytes)), measuredAt: now },
              update: { bytes: BigInt(Math.round(bytes)), measuredAt: now },
            });
          }
        }
      }
      // Deep check: record the destination's integrity status + alert on failure
      // (restic's check is repo-level, not attributable to one snapshot).
      if (isDeep) {
        const ok = !integrityError && corrupt.length === 0;
        const updated = await prisma.destination.update({
          where: { id: destinationId },
          data: { lastIntegrityAt: now, lastIntegrityStatus: ok ? "ok" : (integrityError ?? `${corrupt.length} corrupt`).slice(0, 500) },
          select: { name: true },
        });
        if (integrityError) await notifyIntegrityFailure(updated.name, integrityError).catch(() => undefined);
      }
    }
  }

  // The payload held decrypted credentials and keys for the agent; nothing reads
  // it once the job is done, so keep only its non-secret scalars.
  await prisma.agentJob
    .update({ where: { id }, data: { payload: scrubPayload(job.payload) as Prisma.InputJsonValue } })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
