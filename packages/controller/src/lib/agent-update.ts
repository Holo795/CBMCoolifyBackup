import { randomUUID } from "node:crypto";
import { compareVersions, imageWithoutTag, SELF_UPDATE_SINCE, type UpdateAgentJob } from "@cbm/shared";
import { prisma } from "./prisma";
import { env } from "./env";
import { cronMatches } from "./cron";
import { getTimezone } from "./settings";
import { AGENT_ONLINE_MS } from "./agent-status";
import { version as CBM_VERSION } from "../../package.json";

export { CBM_VERSION };

/** What the Agents page needs to know about an agent's version. */
type AgentVersionFields = {
  status: string;
  lastSeenAt: Date | null;
  version: string | null;
  image: string | null;
  selfUpdate: string | null;
};

/**
 * Where an agent stands against the controller's version, and what CBM can do:
 *  - "current" / "newer": nothing to do;
 *  - "update": an update can be queued now;
 *  - "manual": it's behind but can't update itself - before 2.6.0, run outside a
 *    container, or managed by docker compose (`reason` says which);
 *  - "offline": behind, but not connected;
 *  - "unknown": it never reported its version.
 */
export type AgentUpdateState =
  | { kind: "current" | "newer" | "unknown" | "offline" }
  | { kind: "update" }
  | { kind: "manual"; reason: "old" | "compose" | "native" };

export function agentUpdateState(a: AgentVersionFields, now = new Date(), controller = CBM_VERSION): AgentUpdateState {
  if (!a.version || a.version === "unknown" || a.version === "0.1.0") return { kind: "unknown" };
  const cmp = compareVersions(a.version, controller);
  if (cmp === 0) return { kind: "current" };
  if (cmp > 0) return { kind: "newer" };
  if (compareVersions(a.version, SELF_UPDATE_SINCE) < 0) return { kind: "manual", reason: "old" };
  if (a.selfUpdate === "compose" || a.selfUpdate === "native") return { kind: "manual", reason: a.selfUpdate };
  const online = a.status === "online" && !!a.lastSeenAt && now.getTime() - a.lastSeenAt.getTime() < AGENT_ONLINE_MS;
  if (!online) return { kind: "offline" };
  return { kind: "update" };
}

/** The image an agent updates to: its own repository (a registry mirror stays
 * one), at the controller's version. */
export function targetImage(agentImage: string | null, version = CBM_VERSION): string {
  const repo = agentImage && !agentImage.startsWith("sha256:") ? imageWithoutTag(agentImage) : env.agentImage;
  return `${repo}:${version}`;
}

export type QueueUpdateResult = { ok: true; jobId: string } | { ok: false; reason: "state" | "pending" };

/** Queue an update of one agent to the controller's version. */
export async function queueAgentUpdate(agentId: string): Promise<QueueUpdateResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, status: true, lastSeenAt: true, version: true, image: true, selfUpdate: true },
  });
  if (!agent || agentUpdateState(agent).kind !== "update") return { ok: false, reason: "state" };
  const pending = await prisma.agentJob.count({ where: { agentId, type: "update-agent", status: { in: ["queued", "running"] } } });
  if (pending) return { ok: false, reason: "pending" };
  const id = randomUUID();
  const payload: UpdateAgentJob = { id, type: "update-agent", image: targetImage(agent.image), version: CBM_VERSION };
  await prisma.agentJob.create({ data: { id, agentId, type: "update-agent", status: "queued", payload } });
  return { ok: true, jobId: id };
}

/** How far ahead a scheduled backup keeps an automatic update away. */
const QUIET_BEFORE_SCHEDULE_MIN = 30;
/** A failed automatic update to a version isn't retried for this long. */
const RETRY_AFTER_FAILURE_MS = 24 * 3600_000;

/** Pure: does one of these crons fire within the next `minutes` minutes? */
export function scheduleSoon(crons: string[], now: Date, timeZone: string, minutes = QUIET_BEFORE_SCHEDULE_MIN): boolean {
  for (let m = 0; m <= minutes; m++) {
    const at = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + m * 60_000);
    for (const c of crons) {
      try {
        if (cronMatches(c, at, timeZone)) return true;
      } catch {
        /* an invalid cron never fires */
      }
    }
  }
  return false;
}

/**
 * Automatic updates (opt-in): each agent behind the controller that can update
 * itself, runs nothing, has no scheduled backup of its instance due in the
 * next 30 minutes, and didn't fail to update to this version in the last day.
 */
export async function autoUpdateAgents(now = new Date()): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { id: "global" }, select: { agentAutoUpdate: true } });
  if (!setting?.agentAutoUpdate) return 0;
  const agents = await prisma.agent.findMany({
    select: { id: true, instanceId: true, status: true, lastSeenAt: true, version: true, image: true, selfUpdate: true },
  });
  const tz = await getTimezone().catch(() => "UTC");
  let queued = 0;
  for (const a of agents) {
    if (agentUpdateState(a, now).kind !== "update") continue;
    const busy = await prisma.agentJob.count({ where: { agentId: a.id, status: { in: ["queued", "running"] } } });
    if (busy) continue;
    const failed = await prisma.agentJob.findMany({
      where: { agentId: a.id, type: "update-agent", status: "failed", createdAt: { gt: new Date(now.getTime() - RETRY_AFTER_FAILURE_MS) } },
      select: { payload: true },
    });
    if (failed.some((j) => (j.payload as { version?: string } | null)?.version === CBM_VERSION)) continue;
    if (a.instanceId) {
      const policies = await prisma.backupPolicy.findMany({
        where: { enabled: true, OR: [{ instanceId: a.instanceId }, { resource: { instanceId: a.instanceId } }] },
        select: { cron: true },
      });
      if (scheduleSoon(policies.map((p) => p.cron), now, tz)) continue;
    }
    if ((await queueAgentUpdate(a.id)).ok) queued++;
  }
  return queued;
}
