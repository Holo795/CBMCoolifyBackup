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
  transport: Transport;
  host: string;
  port: number;
};

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

  return {
    cbmUrl,
    cbmToken,
    transport,
    host: (process.env.CBM_MCP_HOST ?? "127.0.0.1").trim(),
    port: Number(process.env.CBM_MCP_PORT ?? 8790),
  };
}
