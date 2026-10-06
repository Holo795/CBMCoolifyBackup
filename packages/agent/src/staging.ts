import type { StagingMode } from "@cbm/shared";

/*
 * Where a volume (or host folder) copy goes on its way to the destination.
 * Pure, so the decision is unit-tested; backup.ts measures and acts on it.
 */

export type StagingChoice =
  /** Through the agent host's work dir (the freeze ends when the copy does). */
  | { where: "local" }
  /** Straight to the destination: no room needed, the freeze lasts the upload. */
  | { where: "direct"; because: "setting" | "no-room" }
  /** restic reads the volume itself (no copy, only changed files are read). */
  | { where: "repository" }
  | { error: string };

const gib = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GiB` : `${Math.round(n / 1024 ** 2)} MiB`);

/** Does the choice need the copy's size (and the free space) first? */
export function needsMeasure(mode: StagingMode, engine: "tar" | "restic"): boolean {
  return engine === "tar" ? mode !== "direct" : mode === "local";
}

export function chooseStaging(o: {
  mode: StagingMode;
  engine: "tar" | "restic";
  label: string;
  /** Estimated size of the copy, or null when it couldn't be measured. */
  needBytes: number | null;
  /** Free space on the work dir, or null when it couldn't be read. */
  freeBytes: number | null;
  /** Space always kept free on top. */
  minFreeBytes: number;
}): StagingChoice {
  // restic backs up the volume where it is, unless a local copy is asked for.
  if (o.engine === "restic" && o.mode !== "local") return { where: "repository" };
  if (o.engine === "tar" && o.mode === "direct") return { where: "direct", because: "setting" };
  // Unknown on either side: behave as before (local), the running checks still apply.
  const fits = o.needBytes == null || o.freeBytes == null || o.freeBytes - o.minFreeBytes >= o.needBytes;
  if (fits) return { where: "local" };
  const noRoom =
    `Not enough free space on the agent host for ${o.label}: ${gib(o.needBytes ?? 0)} needed, ` +
    `${gib(Math.max(0, (o.freeBytes ?? 0) - o.minFreeBytes))} usable ` +
    `(${gib(o.freeBytes ?? 0)} free, ${gib(o.minFreeBytes)} kept free)`;
  if (o.mode === "local") return { error: `${noRoom}. Free some space, or set the agent's copy mode to auto or direct.` };
  return { where: "direct", because: "no-room" };
}
