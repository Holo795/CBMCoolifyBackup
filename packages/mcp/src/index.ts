#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { runStdio } from "./stdio.js";
import { runHttp } from "./http.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (cfg.transport === "http") await runHttp(cfg);
  else await runStdio(cfg);
}

main().catch((e) => {
  console.error(`[cbm-mcp] fatal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
