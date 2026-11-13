import { isIP } from "node:net";
import os from "node:os";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export interface AgentConfig {
  controllerUrl: string;
  enrollmentToken: string;
  agentToken: string;
  hostname: string;
  /** Optional: pin this agent to a Coolify server uuid (disables auto-detect). */
  serverUuid: string;
  workDir: string;
  dockerBin: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}

export function loadConfig(): AgentConfig {
  return {
    controllerUrl: env("CONTROLLER_URL", "http://localhost:3000").replace(/\/$/, ""),
    enrollmentToken: optional("ENROLLMENT_TOKEN"),
    agentToken: optional("AGENT_TOKEN"),
    hostname: optional("AGENT_HOSTNAME", os.hostname()),
    serverUuid: optional("AGENT_SERVER_UUID"),
    workDir: optional("AGENT_WORK_DIR", "/tmp/cbm-agent"),
    dockerBin: optional("DOCKER_BIN", "docker"),
    pollIntervalMs: Number(optional("POLL_INTERVAL_MS", "5000")),
    heartbeatIntervalMs: Number(optional("HEARTBEAT_INTERVAL_MS", "30000")),
  };
}

/**
 * Why the agent refuses to talk to this controller URL, or null. Plain HTTP
 * carries the agent's credential and every job (destination credentials,
 * encryption keys) in clear: it is only accepted to a private address - the
 * same host, a Docker network, a LAN - or with AGENT_ALLOW_HTTP=true.
 */
export function insecureControllerUrl(raw: string, allowHttp = process.env.AGENT_ALLOW_HTTP === "true"): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `CONTROLLER_URL is not a URL: ${raw}`;
  }
  if (url.protocol === "https:" || allowHttp) return null;
  if (url.protocol !== "http:") return `CONTROLLER_URL must be https:// (got ${url.protocol})`;
  if (isPrivateHost(url.hostname)) return null;
  return (
    `CONTROLLER_URL is plain http:// to a public address (${url.hostname}): the agent's credential and the ` +
    "destination credentials and keys its jobs carry would travel in clear. Use https://, or set " +
    "AGENT_ALLOW_HTTP=true if the link is protected otherwise (VPN, tunnel)."
  );
}

/** Loopback, private and link-local addresses, and names that can only be local. */
export function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(h)) return true;
  const kind = isIP(h);
  if (kind === 4) {
    const [a, b] = h.split(".").map(Number);
    return a === 10 || a === 127 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b! >= 64 && b! <= 127);
  }
  if (kind === 6) {
    if (h === "::1") return true;
    const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
    if (v4) return isPrivateHost(v4[1]!);
    return /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  // A single-label name (a Docker service, "controller"): resolved on the local network.
  return !h.includes(".");
}
