import { prisma } from "./prisma";

/**
 * After a recovery-file import, nothing acts on production until an admin
 * says this install is the one that replaces it: no scheduled backup or
 * housekeeping (retention, prunes, checks, mirror copies), no self-backup, no
 * alert. A test import (the docs advise one) used to overwrite production's
 * self-backup within minutes, run its schedules and alert its webhook.
 * Discovery from Coolify keeps running: it only reads.
 */
export async function recoveryHoldSince(): Promise<Date | null> {
  const s = await prisma.setting.findUnique({ where: { id: "global" }, select: { recoveryHoldSince: true } }).catch(() => null);
  return s?.recoveryHoldSince ?? null;
}

/** Tasks that still run on hold (read-only towards production). */
export const RUNS_ON_HOLD = new Set(["auto-sync", "env dedupe", "job history cleanup"]);
