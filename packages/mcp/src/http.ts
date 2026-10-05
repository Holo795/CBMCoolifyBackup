import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CbmClient } from "./client.js";
import { createServer } from "./server.js";
import { timingSafeEqual } from "node:crypto";
import { isLoopback, type Config } from "./config.js";

const MCP_PATH = "/mcp";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

/** Largest JSON-RPC request accepted (our calls are a few hundred bytes). */
const MAX_BODY_BYTES = 1024 * 1024;

class BodyTooLarge extends Error {}

/** Collect and JSON-parse a request body (empty body -> undefined), capped. */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(c as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function bearer(req: IncomingMessage): string | null {
  const m = (req.headers["authorization"] ?? "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The CBM token for this request, or why it is refused. With a server-wide
 * CBM_TOKEN, callers must present CBM_MCP_AUTH_TOKEN when one is configured
 * (always the case off loopback, see config); otherwise each caller sends its
 * own CBM token, which is forwarded.
 */
function resolveToken(cfg: Config, req: IncomingMessage): { token: string } | { refuse: string } {
  if (cfg.cbmToken) {
    if (cfg.mcpAuthToken) {
      const given = bearer(req);
      if (!given || !sameSecret(given, cfg.mcpAuthToken)) return { refuse: "invalid or missing MCP auth token" };
    }
    return { token: cfg.cbmToken };
  }
  const own = bearer(req);
  return own ? { token: own } : { refuse: "missing bearer token (send Authorization: Bearer <your CBM API token>)" };
}

/** DNS-rebinding guard: a loopback-bound server only answers to a loopback Host. */
function hostAllowed(cfg: Config, req: IncomingMessage): boolean {
  if (!isLoopback(cfg.host)) return true;
  const host = (req.headers.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || host.startsWith("127.");
}

/**
 * Streamable HTTP transport, stateless: a fresh MCP server + transport per POST,
 * so remote agents can connect over the network without shared session state.
 * Each request authenticates with a bearer token (server-wide or forwarded), and
 * the server binds to that token for the duration of the call.
 */
export async function runHttp(cfg: Config): Promise<Server> {
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

    if (!hostAllowed(cfg, req)) return sendJson(res, 403, { error: "host not allowed" });
    const auth = resolveToken(cfg, req);
    if ("refuse" in auth) return sendJson(res, 401, { error: auth.refuse });

    let body: unknown;
    try {
      body = await readBody(req);
    } catch (e) {
      if (e instanceof BodyTooLarge) return sendJson(res, 413, { error: "request body too large" });
      return sendJson(res, 400, { error: "invalid JSON body" });
    }

    const client = new CbmClient(cfg.cbmUrl, auth.token);
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
  return httpServer;
}
