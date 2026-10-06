import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { serializeDestination } from "@/lib/api-serialize";

export const dynamic = "force-dynamic";

/** List backup destinations (local / ssh / s3), with integrity, mirror and deletion-protection status. */
export async function GET(req: Request) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;

  const rows = await prisma.destination.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      engine: true,
      encryptionEnabled: true,
      integrityCheckEnabled: true,
      lastIntegrityAt: true,
      lastIntegrityStatus: true,
      mirrorToId: true,
      protected: true,
      mirrorRetention: true,
      mirrorKeepDaily: true,
      mirrorKeepWeekly: true,
      mirrorKeepMonthly: true,
      protectionStatus: true,
      protectionCheckedAt: true,
    },
  });
  return NextResponse.json({ items: rows.map(serializeDestination) });
}
