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

/** Badge tone for a restore drill: passed / failed / error / running. */
export function drillTone(status: string): "success" | "danger" | "warning" | "accent" {
  return status === "passed" ? "success" : status === "failed" ? "danger" : status === "error" ? "warning" : "accent";
}

// A stopped resource has no meaningful health: Coolify still reports most of
// them as "exited:unhealthy", which only means "not running".
const STOPPED = new Set(["exited", "stopped", "dead", "deleted", "removing"]);

/**
 * Localize a Coolify resource status; unknown tokens are kept verbatim.
 * "running:unknown" means no healthcheck is configured (not an unknown state),
 * and a stopped or degraded resource is shown without its health.
 */
export function resourceStatusLabel(t: T, raw: string | null | undefined): string {
  if (!raw) return raw ?? "";
  const [state, health] = raw.split(":");
  const loc = (tok: string) => (KNOWN.has(tok) ? t(`resources.statuses.${tok}`) : tok);
  if (state === "running") {
    if (!health || health === "healthy") return loc(state);
    if (health === "unknown") return `${loc(state)} (${t("resources.statuses.noHealthcheck")})`;
    if (health === "unhealthy") return `${loc(state)} (${t("resources.statuses.healthFailing")})`;
  }
  if (STOPPED.has(state) || state === "degraded") return loc(state);
  return health ? `${loc(state)} (${loc(health)})` : loc(state);
}

/**
 * Dot colour for a Coolify resource status: running is green (with or without
 * a healthcheck), a failing healthcheck, a degraded service or a paused
 * resource is yellow, a stopped one red, anything transitional neutral.
 */
export function resourceStatusTone(raw: string | null | undefined): "success" | "warning" | "danger" | "neutral" {
  const [state = "", health = ""] = (raw ?? "").split(":");
  if (state === "running") return health === "unhealthy" ? "warning" : "success";
  if (state === "degraded" || state === "paused") return "warning";
  if (STOPPED.has(state)) return "danger";
  return "neutral";
}
