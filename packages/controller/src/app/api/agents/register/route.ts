import { NextResponse } from "next/server";
import { AgentRegisterRequest } from "@cbm/shared";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/crypto";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = AgentRegisterRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload", details: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  // Zero-config: a per-instance enrollment token both authenticates the agent
  // AND identifies which Coolify instance it serves -> auto-link, no INSTANCE_UUID.
  // Only the sha256 hash is stored, so we match on the hash.
  let instanceId: string | undefined;
  const byToken = await prisma.coolifyInstance.findFirst({
    where: { enrollTokenHash: sha256Hex(data.enrollmentToken) },
  });
  if (byToken) {
    instanceId = byToken.id;
  } else if (data.enrollmentToken.startsWith("cbm_")) {
    // Looks like a per-instance token but matched nothing -> rotated or revoked.
    // Signal the agent to reconfigure with a freshly revealed install command.
    return NextResponse.json(
      { error: "enrollment token invalid or rotated — reveal a new install command in the controller" },
      { status: 401 },
    );
  } else {
    // Fallback: a global enrollment token (manual link via UI later).
    if (env.enrollmentToken && data.enrollmentToken !== env.enrollmentToken) {
      return NextResponse.json({ error: "invalid enrollment token" }, { status: 401 });
    }
    if (data.instanceUuid) {
      const inst = await prisma.coolifyInstance.findFirst({ where: { id: data.instanceUuid } });
      instanceId = inst?.id;
    }
  }

  // Idempotent per host: one agent identity per (instance, hostname). Restarting
  // or re-running the install command reuses the same Agent row (and rotates its
  // bearer token) instead of accumulating duplicates.
  const token = randomToken();
  const existing = instanceId
    ? await prisma.agent.findFirst({ where: { instanceId, hostname: data.hostname } })
    : null;
  const agent = existing
    ? await prisma.agent.update({
        where: { id: existing.id },
        data: { tokenHash: sha256Hex(token), status: "online", lastSeenAt: new Date() },
      })
    : await prisma.agent.create({
        data: {
          hostname: data.hostname,
          tokenHash: sha256Hex(token),
          instanceId,
          status: "online",
          lastSeenAt: new Date(),
        },
      });

  return NextResponse.json({ agentId: agent.id, agentToken: token });
}
