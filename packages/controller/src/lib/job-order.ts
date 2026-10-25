/**
 * Which queued job an agent takes next. Oldest first within a rank, and:
 *  - a restore before anything (someone is waiting on it), then backups and
 *    agent updates, then drills, mirrors and checks, prunes last: a prune can
 *    wait days, a backup only its schedule's slot;
 *  - a prune only while no other prune and no integrity check runs on its
 *    destination (on any agent): it needs the repository to itself, so it
 *    would only wait for the lock - holding a slot a backup could use.
 */
const RANK: Record<string, number> = {
  restore: 0,
  backup: 1,
  "update-agent": 1,
  "restore-drill": 2,
  mirror: 2,
  "verify-destination": 2,
  prune: 3,
};
const DEFAULT_RANK = 2;

export interface QueuedJob {
  id: string;
  type: string;
  /** The destination a prune deletes from. */
  destinationId: string | null;
}

/** `queued` oldest first; `pruning`: destinations a prune or an integrity check is running on. */
export function nextJob<T extends QueuedJob>(queued: T[], pruning: Set<string>): T | null {
  let best: T | null = null;
  let bestRank = Infinity;
  for (const j of queued) {
    if (j.type === "prune" && j.destinationId && pruning.has(j.destinationId)) continue;
    const rank = RANK[j.type] ?? DEFAULT_RANK;
    if (rank < bestRank) {
      best = j;
      bestRank = rank;
    }
  }
  return best;
}
