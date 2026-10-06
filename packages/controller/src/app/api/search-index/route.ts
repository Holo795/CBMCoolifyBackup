import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/** Lightweight index for the command palette: names + ids of the things you can
 * jump to. Loaded once when the palette opens, then filtered client-side.
 * Users and API tokens are only listed for admins (the pages they lead to are
 * admin-only too). */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isAdmin = can(session.user, "admin");

  const [resources, destinations, instances, agents, snapshots, users, apiTokens] = await Promise.all([
    prisma.resource.findMany({
      where: { status: { not: "deleted" } },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    prisma.destination.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    prisma.coolifyInstance.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.agent.findMany({ select: { id: true, hostname: true }, orderBy: { hostname: "asc" } }),
    prisma.snapshot.findMany({
      where: { mirrorOfId: null },
      orderBy: { startedAt: "desc" },
      take: 30,
      select: { id: true, status: true, startedAt: true, resource: { select: { name: true } } },
    }),
    isAdmin
      ? prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    isAdmin
      ? prisma.apiToken.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    resources,
    destinations,
    instances,
    agents,
    snapshots: snapshots.map((s) => ({ id: s.id, status: s.status, startedAt: s.startedAt, resource: s.resource.name })),
    users,
    apiTokens,
  });
}
