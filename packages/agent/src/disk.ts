import { statfs } from "node:fs/promises";

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
