import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * Containers the agent has paused (backup freeze) or stopped (in-place restore)
 * and not yet resumed, persisted so that an agent killed in between - SIGKILL,
 * OOM, `docker rm -f` on reinstall - can't leave a production app frozen or down
 * for good: they are resumed on SIGTERM and swept at the next start.
 * Recorded BEFORE pausing/stopping, released after a successful resume.
 */
export type HeldContainer = { name: string; action: "paused" | "stopped"; since: string };

let statePath: string | null = null;
let held: HeldContainer[] = [];

/** Point the registry at <workDir>/state (no-op until called: tests, CLI). */
export function initHeldContainers(workDir: string): void {
  const dir = join(workDir, "state");
  mkdirSync(dir, { recursive: true });
  statePath = join(dir, "held-containers.json");
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
    held = Array.isArray(parsed) ? (parsed as HeldContainer[]) : [];
  } catch {
    held = [];
  }
}

function persist(): void {
  if (!statePath) return;
  const tmp = `${statePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(held), { mode: 0o600 });
  renameSync(tmp, statePath); // atomic replace
}

export function holdContainer(name: string, action: HeldContainer["action"]): void {
  held = held.filter((h) => h.name !== name);
  held.push({ name, action, since: new Date().toISOString() });
  persist();
}

export function releaseContainer(name: string): void {
  const before = held.length;
  held = held.filter((h) => h.name !== name);
  if (held.length !== before) persist();
}

export function heldContainers(): HeldContainer[] {
  return [...held];
}
