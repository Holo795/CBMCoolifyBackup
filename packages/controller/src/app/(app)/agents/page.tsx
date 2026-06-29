import { prisma } from "@/lib/prisma";
import { groupServersByInstance } from "@/lib/servers";
import { AgentsView, type AgentItem } from "./agents-view";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await prisma.agent.findMany({ orderBy: { createdAt: "asc" }, include: { instance: true } });

  // Candidate servers per instance, derived from discovered resources (no extra
  // Coolify API call). Drives the per-agent "Server" override dropdown.
  const serverRows = await prisma.resource.findMany({
    where: { serverUuid: { not: null } },
    select: { instanceId: true, serverUuid: true, serverName: true },
  });
  const serversByInstance = groupServersByInstance(serverRows);
  const serverOptionsFor = (instanceId: string | null) =>
    instanceId
      ? [...(serversByInstance.get(instanceId)?.entries() ?? [])].map(([uuid, name]) => ({ uuid, name }))
      : [];

  const items: AgentItem[] = agents.map((agent) => ({ agent, options: serverOptionsFor(agent.instanceId) }));

  return <AgentsView items={items} />;
}
