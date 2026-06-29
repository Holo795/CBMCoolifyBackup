import { prisma } from "@/lib/prisma";
import { OverviewView } from "./overview-view";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [instances, resources, enabled, snapshots, agentsOnline, recent] = await Promise.all([
    prisma.coolifyInstance.count(),
    prisma.resource.count(),
    prisma.resource.count({ where: { backupEnabled: true } }),
    prisma.snapshot.count({ where: { status: "succeeded" } }),
    prisma.agent.count({ where: { status: "online" } }),
    prisma.snapshot.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { resource: true },
    }),
  ]);

  return (
    <OverviewView counts={{ instances, resources, enabled, snapshots, agentsOnline }} recent={recent} />
  );
}
