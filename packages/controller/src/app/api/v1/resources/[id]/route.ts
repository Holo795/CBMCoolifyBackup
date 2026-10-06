import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeResource } from "@/lib/api-serialize";
import { effectivePolicy } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** One resource, with its effective backup schedule (resolved override chain). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const r = await prisma.resource.findUnique({
    where: { id },
    select: {
      id: true,
      instanceId: true,
      coolifyUuid: true,
      name: true,
      type: true,
      projectName: true,
      environment: true,
      status: true,
      serverUuid: true,
      serverName: true,
      backupEnabled: true,
      liveBackup: true,
      backupExcludes: true,
      instance: { select: { name: true } },
    },
  });
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });

  const eff = await effectivePolicy(id);
  const schedule = eff.policy
    ? { source: eff.source, mode: eff.policy.mode, cron: eff.policy.cron, destinationId: eff.policy.destinationId, destinationName: eff.policy.destination?.name ?? null }
    : { source: "none" as const, mode: null, cron: null, destinationId: null, destinationName: null };

  return NextResponse.json({ ...serializeResource(r), schedule });
}
