import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
};

export const SERVER_NAME = "cbm";
export const SERVER_VERSION: string = pkg.version;

export type Transport = "stdio" | "http";

export type Config = {
  cbmUrl: string;
  cbmToken: string | undefined;
  /** HTTP: shared secret every request must present when CBM_TOKEN is server-wide. */
  mcpAuthToken: string | undefined;
  transport: Transport;
  host: string;
  port: number;
};

/** Is `host` a loopback bind address? */
export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host.startsWith("127.");
}

/** Read configuration from the environment. Throws on anything unusable. */
export function loadConfig(): Config {
  const cbmUrl = (process.env.CBM_URL ?? "").trim();
  if (!cbmUrl) throw new Error("CBM_URL is required (the controller base URL, e.g. https://cbm.example.com)");

  const transport = (process.env.CBM_MCP_TRANSPORT ?? "stdio").trim() as Transport;
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(`CBM_MCP_TRANSPORT must be "stdio" or "http" (got "${transport}")`);
  }

  const cbmToken = (process.env.CBM_TOKEN ?? "").trim() || undefined;
  // stdio always needs a token here; http may instead forward each agent's token.
  if (transport === "stdio" && !cbmToken) {
    throw new Error("CBM_TOKEN is required for stdio transport (create one in CBM → Settings → API tokens)");
  }

  const host = (process.env.CBM_MCP_HOST ?? "127.0.0.1").trim();
  const mcpAuthToken = (process.env.CBM_MCP_AUTH_TOKEN ?? "").trim() || undefined;
  if (transport === "http") {
    if (mcpAuthToken && !cbmToken) {
      throw new Error("CBM_MCP_AUTH_TOKEN only applies with a server-wide CBM_TOKEN (otherwise each agent sends its own CBM token)");
    }
    // A server-wide token on a reachable address hands its power to anyone who
    // can reach the port: require a shared secret from callers in that case.
    if (cbmToken && !isLoopback(host) && !mcpAuthToken) {
      throw new Error(
        `CBM_TOKEN is server-wide and the server listens on ${host}: anyone who can reach it would act with that token. ` +
          "Set CBM_MCP_AUTH_TOKEN (a shared secret callers send as Authorization: Bearer), " +
          "or unset CBM_TOKEN so each agent authenticates with its own CBM token.",
      );
    }
  }

  return {
    cbmUrl,
    cbmToken,
    mcpAuthToken,
    transport,
    host,
    port: Number(process.env.CBM_MCP_PORT ?? 8790),
  };
}
