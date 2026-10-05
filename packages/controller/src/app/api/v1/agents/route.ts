import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeAgent } from "@/lib/api-serialize";
import { parseQuery, agentsQuery } from "@/lib/api-validate";

export const dynamic = "force-dynamic";

/** List backup agents and their liveness / Docker host facts. `?instanceId=`. */
export async function GET(req: Request) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const q = parseQuery(agentsQuery, req);
  if (!q.ok) return q.response;
  const { instanceId } = q.data;
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
