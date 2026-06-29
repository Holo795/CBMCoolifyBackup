import { prisma } from "@/lib/prisma";
import { getTimezone } from "@/lib/settings";
import { groupServersByInstance } from "@/lib/servers";
import { InstancesView } from "./instances-view";

export const dynamic = "force-dynamic";

export default async function InstancesPage() {
  const [instances, destinations, serverRows] = await Promise.all([
    prisma.coolifyInstance.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { resources: true } },
        agents: { select: { status: true, lastSeenAt: true, serverUuid: true } },
        policies: { where: { resourceId: null }, include: { destination: true } },
      },
    }),
    prisma.destination.findMany({ orderBy: { name: "asc" } }),
    prisma.resource.findMany({
      where: { serverUuid: { not: null } },
      select: { instanceId: true, serverUuid: true, serverName: true },
    }),
  ]);
  const tz = await getTimezone();

  // Distinct servers per instance (from discovered resources).
  const serversByInstance = groupServersByInstance(serverRows);

  // Last scheduled run per policy (instance- and server-level).
  const policyIds = instances.flatMap((i) => i.policies.map((p) => p.id));
  const latestRuns = policyIds.length
    ? await prisma.snapshot.findMany({
        where: { policyId: { in: policyIds }, runId: { not: null } },
        orderBy: { startedAt: "desc" },
        distinct: ["policyId"],
        select: { policyId: true, runId: true, startedAt: true },
      })
    : [];
  // Tally each run's snapshot statuses in ONE grouped query (not one per policy).
  const runIds = latestRuns.map((r) => r.runId).filter((x): x is string => !!x);
  const statusByRun = new Map<string, { ok: number; failed: number; running: number; total: number }>();
  if (runIds.length) {
    const groups = await prisma.snapshot.groupBy({ by: ["runId", "status"], where: { runId: { in: runIds } }, _count: true });
    for (const g of groups) {
      if (!g.runId) continue;
      const e = statusByRun.get(g.runId) ?? { ok: 0, failed: 0, running: 0, total: 0 };
      e.total += g._count;
      if (g.status === "succeeded") e.ok += g._count;
      else if (g.status === "failed") e.failed += g._count;
      else if (g.status === "running") e.running += g._count;
      statusByRun.set(g.runId, e);
    }
  }
  const runByPolicy = new Map<string, { at: Date; ok: number; failed: number; running: number; total: number }>();
  for (const run of latestRuns) {
    if (!run.runId || !run.policyId) continue;
    runByPolicy.set(run.policyId, { at: run.startedAt, ...(statusByRun.get(run.runId) ?? { ok: 0, failed: 0, running: 0, total: 0 }) });
  }

  return (
    <InstancesView
      instances={instances}
      destinations={destinations}
      tz={tz}
      serversByInstance={serversByInstance}
      runByPolicy={runByPolicy}
    />
  );
}
