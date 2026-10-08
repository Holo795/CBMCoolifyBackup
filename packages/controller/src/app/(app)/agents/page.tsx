import { prisma } from "@/lib/prisma";
import { groupServersByInstance } from "@/lib/servers";
import { AgentsView, type AgentItem } from "./agents-view";
import { AGENT_SECRETS, INSTANCE_SECRETS } from "@/lib/public-fields";
import { parseAgentSettings } from "@/lib/agent-settings";
import { agentUpdateState } from "@/lib/agent-update";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
    omit: AGENT_SECRETS,
    include: { instance: { omit: INSTANCE_SECRETS } },
  });

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

  // The latest update job of each agent: under way, or how the last one ended.
  const updates = await prisma.agentJob.findMany({
    where: { type: "update-agent", createdAt: { gt: new Date(Date.now() - 7 * 24 * 3600_000) } },
    orderBy: { createdAt: "desc" },
    select: { agentId: true, status: true, error: true },
  });
  const lastUpdate = new Map<string, (typeof updates)[number]>();
  for (const u of updates) if (!lastUpdate.has(u.agentId)) lastUpdate.set(u.agentId, u);

  const now = new Date();
  const items: AgentItem[] = agents.map((agent) => {
    const last = lastUpdate.get(agent.id);
    return {
      agent,
      options: serverOptionsFor(agent.instanceId),
      update: agentUpdateState(agent, now),
      updating: last?.status === "queued" || last?.status === "running",
      updateError: last?.status === "failed" ? (last.error ?? "") : null,
    };
  });

  const setting = await prisma.setting.findUnique({
    where: { id: "global" },
    select: { agentDefaults: true, agentAutoUpdate: true },
  });
  return (
    <AgentsView items={items} defaults={parseAgentSettings(setting?.agentDefaults)} autoUpdate={setting?.agentAutoUpdate ?? false} />
  );
}
