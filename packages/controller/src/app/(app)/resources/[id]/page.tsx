import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { liveAgentWhere } from "@/lib/agent-status";
import { effectivePolicy } from "@/lib/schedule";
import { getTimezone } from "@/lib/settings";
import { can, requireUser } from "@/lib/session";
import { ResourceDetailView } from "./detail-view";
import { DESTINATION_SECRETS, INSTANCE_SECRETS } from "@/lib/public-fields";

export const dynamic = "force-dynamic";

export default async function ResourceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await prisma.resource.findUnique({ where: { id }, include: { instance: { omit: INSTANCE_SECRETS } } });
  if (!resource) notFound();

  const [destinations, override, snapshots, eff] = await Promise.all([
    prisma.destination.findMany({ orderBy: { name: "asc" }, omit: DESTINATION_SECRETS }),
    prisma.backupPolicy.findFirst({ where: { resourceId: id }, include: { destination: { omit: DESTINATION_SECRETS } } }),
    prisma.snapshot.findMany({
      where: { resourceId: id },
      orderBy: { startedAt: "desc" },
      take: 30,
      include: { destination: { omit: DESTINATION_SECRETS } },
    }),
    effectivePolicy(id),
  ]);

  // Backups/restores need a live agent on this resource's instance.
  const liveAgent = await prisma.agent.findFirst({
    where: liveAgentWhere(resource.instanceId),
    select: { id: true },
  });
  const agentDown = !liveAgent;
  const removed = resource.status === "deleted"; // no longer in Coolify
  const tz = await getTimezone();
  const isAdmin = can(await requireUser(), "admin");
  if (!isAdmin) resource.hooks = null;

  return (
    <ResourceDetailView
      resource={resource}
      destinations={destinations}
      override={override}
      snapshots={snapshots}
      eff={eff}
      agentDown={agentDown}
      removed={removed}
      tz={tz}
      isAdmin={isAdmin}
    />
  );
}
