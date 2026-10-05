import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CbmClient } from "./client.js";
import { registerTools } from "./tools.js";
import { SERVER_NAME, SERVER_VERSION } from "./config.js";

/** Build an MCP server bound to one CBM client (one bearer token). */
export function createServer(client: CbmClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, client);
  return server;
}
