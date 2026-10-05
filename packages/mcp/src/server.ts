import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CbmClient } from "./client.js";
import { registerTools } from "./tools.js";
import { SERVER_NAME, SERVER_VERSION } from "./config.js";

/** Build an MCP server bound to one CBM client (one bearer token). */
export function createServer(client: CbmClient): McpServer {
  // Our tools take a few scalar arguments: cap what a single call may carry.
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { maxToolInputElements: 64 });
  registerTools(server, client);
  return server;
}
