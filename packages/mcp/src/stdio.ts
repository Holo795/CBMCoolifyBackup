import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CbmClient } from "./client.js";
import { createServer } from "./server.js";
import type { Config } from "./config.js";

/**
 * stdio transport: the AI client (Claude Desktop, Cursor, Cline, …) spawns this
 * process and talks over stdin/stdout. One fixed token from CBM_TOKEN. Nothing
 * may be written to stdout except the protocol, so logs go to stderr.
 */
export async function runStdio(cfg: Config): Promise<void> {
  const client = new CbmClient(cfg.cbmUrl, cfg.cbmToken!);
  const server = createServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[cbm-mcp] stdio ready -> ${cfg.cbmUrl}`);
}
