import { prisma } from "./prisma";
import { recoveryHoldSince } from "./recovery-hold";

/**
 * The external check (M-08): every alert comes from the controller, so when
 * the controller itself is down nobody hears of it. CBM pings a URL of the
 * admin's monitor (healthchecks.io, Uptime Kuma push, Cronitor...) every 5
 * minutes while it runs and at least one agent answers; the monitor alerts
 * when the pings stop. Not while on hold after a recovery-file import: a test
 * install must not hide production being down.
 */
export function pingDue(
  state: { agents: Array<{ status: string }>; onHold: boolean },
): { ping: boolean; reason?: string } {
  if (state.onHold) return { ping: false, reason: "on hold after a recovery-file import" };
  if (state.agents.length > 0 && !state.agents.some((a) => a.status === "online")) {
    return { ping: false, reason: "no agent online" };
  }
  return { ping: true };
}

export async function pingExternal(now = new Date()): Promise<void> {
  const setting = await prisma.setting.findUnique({ where: { id: "global" }, select: { pingUrl: true } });
  if (!setting?.pingUrl) return;
  const due = pingDue({
    agents: await prisma.agent.findMany({ select: { status: true } }),
    onHold: !!(await recoveryHoldSince()),
  });
  let status: string;
  if (!due.ping) status = `not sent: ${due.reason}`;
  else {
    status = await fetch(setting.pingUrl, { method: "GET", signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? "ok" : `HTTP ${r.status}`))
      .catch((e) => `failed: ${(e as Error).message}`);
  }
  await prisma.schedulerState
    .update({ where: { id: "global" }, data: { lastPingAt: now, lastPingStatus: status.slice(0, 200) } })
    .catch(() => undefined);
}
