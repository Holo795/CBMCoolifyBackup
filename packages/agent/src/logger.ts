import { getSettings } from "./settings.js";

type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
function log(level: Level, msg: string, extra?: unknown) {
  // Read live: the level can change from CBM without a restart (env LOG_LEVEL wins).
  if (order[level] < order[getSettings().logLevel]) return;
  const ts = new Date().toISOString();
  const line = `${ts} ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (extra !== undefined) {
    console[level === "debug" ? "log" : level](line, extra);
  } else {
    console[level === "debug" ? "log" : level](line);
  }
}

export const logger = {
  debug: (m: string, e?: unknown) => log("debug", m, e),
  info: (m: string, e?: unknown) => log("info", m, e),
  warn: (m: string, e?: unknown) => log("warn", m, e),
  error: (m: string, e?: unknown) => log("error", m, e),
};
