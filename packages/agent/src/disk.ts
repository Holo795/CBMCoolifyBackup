import { readdir, rm, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Staging needs room on the agent host: fail early with a clear message rather
 * than half-way through a copy (or by filling the host's root disk).
 * AGENT_MIN_FREE_MB (default 1024) is kept free on top of what a step needs.
 */
export function minFreeBytes(): number {
  const mb = Number(process.env.AGENT_MIN_FREE_MB ?? 1024);
  return Math.max(0, Number.isFinite(mb) ? mb : 1024) * 1024 * 1024;
}

const fmt = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GiB`;

/** Throw when `dir`'s filesystem has less than the floor plus `needBytes` free. */
export async function assertFreeSpace(dir: string, needBytes = 0): Promise<void> {
  let free: number;
  try {
    const s = await statfs(dir);
    free = Number(s.bavail) * Number(s.bsize);
  } catch {
    return; // can't tell: don't block the job on it
  }
  const need = minFreeBytes() + Math.max(0, needBytes);
  if (free < need) {
    throw new Error(
      `Not enough free disk space on the agent host (${dir}): ${fmt(free)} free, ${fmt(need)} needed. ` +
        `Free some space or mount a bigger work dir (AGENT_WORK_DIR, AGENT_MIN_FREE_MB).`,
    );
  }
}

/** Is this the "disk full" error? */
export function isDiskFull(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "ENOSPC" || /ENOSPC|no space left on device/i.test(err?.message ?? "");
}

const JOB_STAGE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|drill-.+|mirror-.+)$/i;
const TMP_STAGE = /^cbm-(restic|verify)-/;

/**
 * Remove the staging a previous run left behind (killed mid-job: crash, OOM,
 * upgrade), which could otherwise pile up gigabytes on the host. Only call it
 * before any job starts. Never touches the outbox or the agent's state.
 */
export async function sweepOrphanedStages(
  workDir: string,
  log: (m: string) => void,
  tmp: string = tmpdir(),
): Promise<void> {
  for (const [dir, re] of [
    [workDir, JOB_STAGE],
    [tmp, TMP_STAGE],
  ] as const) {
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      if (!re.test(name)) continue;
      await rm(join(dir, name), { recursive: true, force: true })
        .then(() => log(`Removed ${join(dir, name)} left by an interrupted job`))
        .catch(() => undefined);
    }
  }
}

