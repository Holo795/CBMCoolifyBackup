import {
  AgentRegisterResponse,
  PollResponse,
  type JobEvent,
  type JobResult,
  type HeartbeatRequest,
  HeartbeatResponse,
} from "@cbm/shared";
import { readFileSync } from "node:fs";
import type { AgentConfig } from "./config.js";

/** This agent's real version (was hard-coded to an old one). */
export const AGENT_VERSION: string = (() => {
  try {
    return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
})();

async function req(cfg: AgentConfig, path: string, init: RequestInit, auth = true): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth && cfg.agentToken) headers["authorization"] = `Bearer ${cfg.agentToken}`;
  return fetch(`${cfg.controllerUrl}${path}`, { ...init, headers });
}

export async function register(cfg: AgentConfig): Promise<AgentRegisterResponse> {
  const res = await req(
    cfg,
    "/api/agents/register",
    {
      method: "POST",
      body: JSON.stringify({
        enrollmentToken: cfg.enrollmentToken,
        hostname: cfg.hostname,
        agentVersion: AGENT_VERSION,
        ...(cfg.serverUuid ? { serverUuid: cfg.serverUuid } : {}),
      }),
    },
    false,
  );
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return AgentRegisterResponse.parse(await res.json());
}

export async function poll(cfg: AgentConfig): Promise<PollResponse> {
  const res = await req(cfg, "/api/agents/jobs", { method: "GET" });
  if (res.status === 204) return { job: null };
  if (!res.ok) throw new Error(`poll failed: ${res.status} ${await res.text()}`);
  return PollResponse.parse(await res.json());
}

export async function sendEvent(cfg: AgentConfig, event: JobEvent): Promise<void> {
  await req(cfg, `/api/agents/jobs/${encodeURIComponent(event.jobId)}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  }).catch(() => undefined);
}

export async function sendResult(cfg: AgentConfig, result: JobResult): Promise<void> {
  const res = await req(cfg, `/api/agents/jobs/${encodeURIComponent(result.jobId)}/result`, {
    method: "POST",
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    // The status lets the outbox tell "retry later" from "never going to work".
    throw Object.assign(new Error(`result failed: ${res.status} ${(await res.text()).slice(0, 300)}`), { status: res.status });
  }
}

/** Send a heartbeat; returns the controller's answer (settings), or null. */
export async function heartbeat(cfg: AgentConfig, data: HeartbeatRequest): Promise<HeartbeatResponse | null> {
  const res = await req(cfg, "/api/agents/heartbeat", { method: "POST", body: JSON.stringify(data) }).catch(() => null);
  if (!res?.ok) return null;
  const parsed = HeartbeatResponse.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}
