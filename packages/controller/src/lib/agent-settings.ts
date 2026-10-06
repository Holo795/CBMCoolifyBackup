import { AgentSettings, type AgentSettingKey } from "@cbm/shared";

/*
 * Agent settings managed from CBM. The defaults apply to every agent; an agent
 * can override some of them. What a host fixes with an environment variable
 * always wins on the agent itself (it reports those as locked).
 */

/** Parse stored JSON into settings, dropping anything invalid (never throws). */
export function parseAgentSettings(raw: unknown): AgentSettings {
  if (!raw || typeof raw !== "object") return {};
  const out: AgentSettings = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const one = AgentSettings.safeParse({ [k]: v });
    if (one.success && (one.data as Record<string, unknown>)[k] !== undefined) Object.assign(out, { [k]: v });
  }
  return out;
}

/** What CBM sends an agent: its own overrides over the shared defaults. */
export function settingsForAgent(defaults: unknown, override: unknown): AgentSettings {
  return { ...parseAgentSettings(defaults), ...parseAgentSettings(override) };
}

/** Read a settings form: empty fields mean "not set here" (inherit). */
export function settingsFromForm(fd: FormData): { settings?: AgentSettings; error?: string } {
  const raw: Record<string, unknown> = {};
  const num = (k: AgentSettingKey) => {
    const v = String(fd.get(k) ?? "").trim();
    if (v !== "") raw[k] = Number(v);
  };
  const str = (k: AgentSettingKey) => {
    const v = String(fd.get(k) ?? "").trim();
    if (v !== "") raw[k] = v;
  };
  num("concurrency");
  num("minFreeMb");
  str("stagingMode");
  str("logLevel");
  const parsed = AgentSettings.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.path.join(".") ?? "invalid" };
  return { settings: parsed.data };
}
