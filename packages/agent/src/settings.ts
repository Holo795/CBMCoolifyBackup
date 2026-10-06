import { AGENT_SETTING_DEFAULTS, AGENT_SETTING_ENV, AgentSettings, type AgentSettingKey } from "@cbm/shared";

/*
 * The agent's tunable settings. Precedence: an environment variable on the
 * host (fixed: CBM shows it as locked) > the value sent by CBM with each
 * heartbeat answer > the built-in default. Read live, so a change from CBM
 * applies without restarting the agent.
 */

type Settings = Required<AgentSettings>;
const KEYS = Object.keys(AGENT_SETTING_DEFAULTS) as AgentSettingKey[];
const NUMERIC = new Set<AgentSettingKey>(["concurrency", "minFreeMb", "resticReadConcurrency", "resticPackSize"]);

/** Settings an env var fixes, parsed and validated (an invalid value is ignored). */
export function readEnvSettings(env: NodeJS.ProcessEnv = process.env): Partial<Settings> {
  const raw: Record<string, unknown> = {};
  for (const k of KEYS) {
    const v = env[AGENT_SETTING_ENV[k]];
    if (v === undefined || v === "") continue;
    raw[k] = NUMERIC.has(k) ? Number(v) : v;
  }
  const out: Partial<Settings> = {};
  for (const k of KEYS) {
    if (!(k in raw)) continue;
    const one = AgentSettings.safeParse({ [k]: raw[k] });
    if (one.success && one.data[k] !== undefined) Object.assign(out, { [k]: one.data[k] });
  }
  return out;
}

/** Merge: env wins, then CBM's value, then the default. */
export function resolveSettings(fromEnv: Partial<Settings>, fromCbm: AgentSettings | undefined): Settings {
  return { ...AGENT_SETTING_DEFAULTS, ...(fromCbm ?? {}), ...fromEnv } as Settings;
}

const envSettings = readEnvSettings();
let current: Settings = resolveSettings(envSettings, undefined);

export function getSettings(): Settings {
  return current;
}

/** Keys fixed by the host environment (reported to CBM). */
export function lockedByEnv(): AgentSettingKey[] {
  return KEYS.filter((k) => k in envSettings);
}

/** Apply what CBM sent. Returns the keys whose effective value changed. */
export function applyCbmSettings(fromCbm: AgentSettings | undefined): AgentSettingKey[] {
  const next = resolveSettings(envSettings, fromCbm);
  const changed = KEYS.filter((k) => next[k] !== current[k]);
  current = next;
  return changed;
}
