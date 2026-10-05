import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeResource } from "@/lib/api-serialize";

export const dynamic = "force-dynamic";

/**
 * List resources (databases, apps, services) across instances.
 * Filters: `?instanceId=` and `?backupEnabled=true|false`.
 */
export async function GET(req: Request) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const instanceId = url.searchParams.get("instanceId") ?? undefined;
  const be = url.searchParams.get("backupEnabled");
  const backupEnabled = be === "true" ? true : be === "false" ? false : undefined;

  const rows = await prisma.resource.findMany({
    where: { ...(instanceId ? { instanceId } : {}), ...(backupEnabled === undefined ? {} : { backupEnabled }) },
    orderBy: [{ instanceId: "asc" }, { name: "asc" }],
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
      instance: { select: { name: true } },
    },
  });
  return NextResponse.json({ items: rows.map(serializeResource) });
}
