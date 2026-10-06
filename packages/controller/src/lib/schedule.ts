import { prisma } from "./prisma";
import type { BackupPolicy, Destination } from "@/generated/prisma/client";
import type { T } from "./i18n-shared";

/** Frequency presets -> cron (evaluated in the timezone set in Settings). */
export const FREQUENCIES: Record<string, string> = {
  hourly: "0 * * * *",
  daily: "0 2 * * *",
  weekly: "0 2 * * 1",
  monthly: "0 2 1 * *",
};

export function freqToCron(freq: string, customCron?: string): string {
  if (freq === "custom") return (customCron || "0 2 * * *").trim();
  return FREQUENCIES[freq] ?? FREQUENCIES.daily;
}

/** Map a cron back to a frequency preset for prefilling forms. */
export function cronToFrequency(cron: string): string {
  for (const [name, expr] of Object.entries(FREQUENCIES)) {
    if (expr === cron) return name;
  }
  return "custom";
}

/** Human description of a cron expression for the UI, in `t`'s language: any
 * fixed-time hourly, daily, weekly (one weekday) or monthly (one day) schedule
 * is spelled out; anything else (steps, ranges, lists…) is shown as-is. */
export function describeCron(cron: string, t: T, timeZone?: string): string {
  const zone = timeZone ? ` ${timeZone}` : "";
  const f = cron.trim().split(/\s+/);
  const num = (v: string | undefined, max: number) => (v !== undefined && /^\d+$/.test(v) && Number(v) <= max ? Number(v) : null);
  const [minute, hour, dom, month, dow] = [num(f[0], 59), num(f[1], 23), num(f[2], 31), f[3], num(f[4], 7)];
  if (f.length !== 5 || minute === null || month !== "*") return cron;
  const two = (n: number) => String(n).padStart(2, "0");
  if (f[1] === "*" && f[2] === "*" && f[4] === "*") {
    return minute === 0 ? t("schedule.cron.hourly") : t("schedule.cron.hourlyAt", { minute: two(minute) });
  }
  if (hour === null) return cron;
  const time = `${two(hour)}:${two(minute)}`;
  if (f[2] === "*" && f[4] === "*") return t("schedule.cron.daily", { time, zone });
  if (f[2] === "*" && dow !== null) {
    const day = t("schedule.cron.days").split(",")[dow % 7];
    return t("schedule.cron.weekly", { day, time, zone });
  }
  if (dom !== null && dom >= 1 && f[4] === "*") return t("schedule.cron.monthly", { dom: String(dom), time, zone });
  return cron;
}

/** A schedule's / snapshot's mode ("backup" | "sync") for the UI. */
export function modeLabel(mode: string, t: T): string {
  return mode === "backup" || mode === "sync" ? t(`schedule.mode.${mode}`) : mode;
}

const CAPTURES = new Set(["dump", "frozen", "live", "none", "config"]);

/** A snapshot's capture mode for the UI ("dump+frozen" → each part translated). */
export function captureLabel(capture: string, t: T): string {
  return capture
    .split("+")
    .map((c) => (CAPTURES.has(c) ? t(`schedule.capture.${c}`) : c))
    .join("+");
}

export type PolicyWithDest = BackupPolicy & { destination: Destination };

/**
 * Resolve the schedule that governs a resource (most specific wins):
 *  - its own override policy, else
 *  - the policy for its server (instanceId + matching serverUuid), else
 *  - its instance's policy (instanceId, no server scope).
 * A policy with neither a resource nor an instance (old "global" schedule) is
 * ignored, as the scheduler ignores it: it must not look like it covers anything.
 */
export async function effectivePolicy(resourceId: string): Promise<{
  policy: PolicyWithDest | null;
  source: "resource" | "server" | "instance" | "none";
}> {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) return { policy: null, source: "none" };

  const own = await prisma.backupPolicy.findFirst({
    where: { resourceId, enabled: true },
    include: { destination: true },
  });
  if (own) return { policy: own, source: "resource" };

  if (resource.serverUuid) {
    const serverPolicy = await prisma.backupPolicy.findFirst({
      where: { instanceId: resource.instanceId, serverUuid: resource.serverUuid, enabled: true },
      include: { destination: true },
    });
    if (serverPolicy) return { policy: serverPolicy, source: "server" };
  }

  const instancePolicy = await prisma.backupPolicy.findFirst({
    where: { instanceId: resource.instanceId, serverUuid: null, enabled: true },
    include: { destination: true },
  });
  if (instancePolicy) return { policy: instancePolicy, source: "instance" };

  return { policy: null, source: "none" };
}
