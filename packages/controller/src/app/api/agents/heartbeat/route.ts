import { NextResponse } from "next/server";
import { HeartbeatRequest } from "@cbm/shared";
import { prisma } from "@/lib/prisma";
import { authenticateAgentFromRequest } from "@/lib/agent-auth";

export async function POST(req: Request) {
  const agent = await authenticateAgentFromRequest(req);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = HeartbeatRequest.safeParse(body);
  const data = parsed.success ? parsed.data : {};

  // Auto-detect which Coolify server this agent backs up: match the resource
  // UUIDs it sees locally against known resources and take their majority
  // server. Never overrides a manual (UI/env) assignment.
  let detected: { serverUuid: string; serverName: string | null } | undefined;
  if (!agent.serverManual && data.resourceUuids && data.resourceUuids.length > 0 && agent.instanceId) {
    const matches = await prisma.resource.findMany({
      where: { instanceId: agent.instanceId, coolifyUuid: { in: data.resourceUuids }, serverUuid: { not: null } },
      select: { serverUuid: true, serverName: true },
    });
    const tally = new Map<string, { count: number; name: string | null }>();
    for (const m of matches) {
      if (!m.serverUuid) continue;
      const t = tally.get(m.serverUuid) ?? { count: 0, name: m.serverName };
      t.count++;
      tally.set(m.serverUuid, t);
    }
    let best: { uuid: string; count: number; name: string | null } | undefined;
    for (const [uuid, t] of tally) {
      if (!best || t.count > best.count) best = { uuid, count: t.count, name: t.name };
    }
    if (best) detected = { serverUuid: best.uuid, serverName: best.name };
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      status: "online",
      lastSeenAt: new Date(),
      dockerVersion: data.dockerVersion ?? agent.dockerVersion,
      containers: data.containers ?? agent.containers,
      ...(detected ? { serverUuid: detected.serverUuid, serverName: detected.serverName } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
