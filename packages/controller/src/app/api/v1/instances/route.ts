import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeInstance } from "@/lib/api-serialize";

export const dynamic = "force-dynamic";

/** List the connected Coolify instances. */
export async function GET(req: Request) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const rows = await prisma.coolifyInstance.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, baseUrl: true, createdAt: true, lastSyncedAt: true },
  });
  return NextResponse.json({ items: rows.map(serializeInstance) });
}
