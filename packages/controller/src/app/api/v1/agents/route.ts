import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeAgent } from "@/lib/api-serialize";

export const dynamic = "force-dynamic";

/** List backup agents and their liveness / Docker host facts. `?instanceId=`. */
export async function GET(req: Request) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const instanceId = new URL(req.url).searchParams.get("instanceId") ?? undefined;
  const rows = await prisma.agent.findMany({
    where: instanceId ? { instanceId } : {},
    orderBy: { hostname: "asc" },
    select: {
      id: true,
      hostname: true,
      instanceId: true,
      status: true,
      dockerVersion: true,
      containers: true,
      serverUuid: true,
      serverName: true,
      lastSeenAt: true,
    },
  });
  return NextResponse.json({ items: rows.map(serializeAgent) });
}
