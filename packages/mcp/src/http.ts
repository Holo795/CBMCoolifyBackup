import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CbmClient } from "./client.js";
import { createServer } from "./server.js";
import type { Config } from "./config.js";

const MCP_PATH = "/mcp";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

/** Collect and JSON-parse a request body (empty body -> undefined). */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

/** Bearer token for this request: a server-wide CBM_TOKEN, else the agent's own. */
function resolveToken(cfg: Config, req: IncomingMessage): string | null {
  if (cfg.cbmToken) return cfg.cbmToken;
  const m = (req.headers["authorization"] ?? "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Streamable HTTP transport, stateless: a fresh MCP server + transport per POST,
 * so remote agents can connect over the network without shared session state.
 * Each request authenticates with a bearer token (server-wide or forwarded), and
 * the server binds to that token for the duration of the call.
 */
export async function runHttp(cfg: Config): Promise<void> {
  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, cbmUrl: cfg.cbmUrl });
    }
    if (url.pathname !== MCP_PATH) return sendJson(res, 404, { error: "not found" });

    // Stateless mode has no SSE stream / session teardown -> only POST is valid.
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST" });
      return res.end(JSON.stringify({ error: "method not allowed (stateless Streamable HTTP accepts POST only)" }));
    }

    const token = resolveToken(cfg, req);
    if (!token) return sendJson(res, 401, { error: "missing bearer token (set CBM_TOKEN on the server or send Authorization: Bearer)" });

    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: "invalid JSON body" });
    }

    const client = new CbmClient(cfg.cbmUrl, token);
    const server = createServer(client);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error("[cbm-mcp] request failed:", e instanceof Error ? e.message : e);
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(cfg.port, cfg.host, resolve));
  console.error(`[cbm-mcp] http ready -> http://${cfg.host}:${cfg.port}${MCP_PATH} -> ${cfg.cbmUrl}`);
}
