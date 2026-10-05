import type { T } from "./i18n";

// Coolify reports resource state as a free-form "state[:health]" string
// (e.g. "running:healthy", "exited", "deleted"). We localize the tokens we
// know and pass anything else through untouched, so the UI never shows a raw
// dictionary key for an unexpected Coolify value.
const KNOWN = new Set([
  "running",
  "exited",
  "restarting",
  "starting",
  "stopped",
  "paused",
  "degraded",
  "unhealthy",
  "healthy",
  "deleted",
  "unknown",
  "created",
  "removing",
  "dead",
]);

/** Localize a Coolify resource status; unknown tokens are kept verbatim. */
export function resourceStatusLabel(t: T, raw: string | null | undefined): string {
  if (!raw) return raw ?? "";
  const [state, health] = raw.split(":");
  const loc = (tok: string) => (KNOWN.has(tok) ? t(`resources.statuses.${tok}`) : tok);
  return health ? `${loc(state)} (${loc(health)})` : loc(state);
}
