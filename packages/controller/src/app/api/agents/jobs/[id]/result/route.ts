import { NextResponse } from "next/server";
import { JobResult } from "@cbm/shared";
import { prisma } from "@/lib/prisma";
import { authenticateAgentFromRequest } from "@/lib/agent-auth";
import { notifyBackupFailed, notifyMissingBackups, notifyCorruptBackups, notifyIntegrityFailure } from "@/lib/notify";
import { enqueueMirror } from "@/lib/jobs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgentFromRequest(req);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const job = await prisma.agentJob.findUnique({ where: { id } });
  if (!job || job.agentId !== agent.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const parsed = JobResult.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid result", details: parsed.error.issues }, { status: 400 });
  }
  const result = parsed.data;
  const succeeded = result.status === "succeeded";

  await prisma.agentJob.update({
    where: { id },
    data: { status: result.status, error: result.error, finishedAt: new Date() },
  });

  if (job.type === "backup" && job.snapshotId) {
    if (succeeded && result.manifest) {
      const m = result.manifest;
      const totalSize = m.artifacts.reduce((acc, a) => acc + (a.sizeBytes ?? 0), 0);
      await prisma.snapshot.update({
        where: { id: job.snapshotId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          manifest: m as unknown as object,
          // The agent's manifest is authoritative for how it actually captured
          // (e.g. a Redis resource dumped logically, not frozen).
          captureMode: m.captureMode,
          resticSnapshotId: result.resticSnapshotId ?? m.resticSnapshotId ?? undefined,
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
    } else if (result.status === "skipped") {
      // Nothing on the host to back up - a clear "ignored" outcome, not a failure
      // (no alert).
      await prisma.snapshot.update({
        where: { id: job.snapshotId },
        data: { status: "skipped", finishedAt: new Date(), error: result.error ?? "Ignored: nothing on the host" },
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
      }
    } else if (!succeeded) {
      console.error(`[mirror] job ${id} failed: ${result.error ?? "unknown error"}`);
    }
  }

  if (job.type === "restore" && job.restoreId) {
    await prisma.restoreJob.update({
      where: { id: job.restoreId },
      data: {
        status: succeeded ? "succeeded" : "failed",
        error: result.error,
        finishedAt: new Date(),
      },
    });
  }

  if (job.type === "verify-destination" && result.verify) {
    const payload = job.payload as { destinationId?: string; engine?: string; isDeep?: boolean } | null;
    const destinationId = payload?.destinationId;
    const isRestic = payload?.engine === "restic";
    const isDeep = !!payload?.isDeep;
    const now = new Date();
    const present = result.verify.present;
    const missing = result.verify.missing;
    const corrupt = result.verify.corrupt ?? [];
    const integrityError = result.verify.integrityError;
    // present/missing carry restic snapshot ids (restic engine) or snapshot
    // directories (tar engine) - match snapshots on the matching column.
    const match = (vals: string[]) =>
      isRestic ? { resticSnapshotId: { in: vals } } : { destinationDir: { in: vals } };
    if (destinationId) {
      if (present.length) {
        // Confirmed present (and, on a deep check, intact): refresh the check
        // time and un-flag any that had been missing/corrupt but recovered.
        await prisma.snapshot.updateMany({ where: { destinationId, ...match(present) }, data: { lastCheckedAt: now } });
        await prisma.snapshot.updateMany({
          where: { destinationId, ...match(present), status: { in: ["missing", "corrupt"] } },
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

  return NextResponse.json({ ok: true });
}
