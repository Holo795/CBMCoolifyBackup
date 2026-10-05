/**
 * Thin HTTP client for the CBM controller's `/api/v1` surface. One instance is
 * bound to one bearer token, so the MCP server can run either with a single
 * server-wide token (stdio, or HTTP + CBM_TOKEN) or with a per-request token
 * forwarded from the calling agent (HTTP without CBM_TOKEN).
 */
export class CbmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "CbmError";
  }
}

type Query = Record<string, string | number | boolean | undefined>;

export class CbmClient {
  readonly baseUrl: string;
  constructor(
    baseUrl: string,
    private readonly token: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request(method: "GET" | "POST", path: string, query?: Query): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    let res: Response;
    try {
      res = await fetch(url, { method, headers: { authorization: `Bearer ${this.token}`, accept: "application/json" } });
    } catch (e) {
      throw new CbmError(`Cannot reach CBM at ${this.baseUrl}: ${e instanceof Error ? e.message : String(e)}`, 0, null);
    }

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      // Error routes use `error`; action routes that decline use `reason`.
      const o = body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
      const detail = o?.error != null ? String(o.error) : o?.reason != null ? String(o.reason) : res.statusText;
      throw new CbmError(`CBM ${method} ${path} -> HTTP ${res.status}: ${detail}`, res.status, body);
    }
    return body;
  }

  private get(path: string, query?: Query) {
    return this.request("GET", path, query);
  }
  private post(path: string, query?: Query) {
    return this.request("POST", path, query);
  }

  whoami() {
    return this.get("/api/v1/whoami");
  }
  listInstances() {
    return this.get("/api/v1/instances");
  }
  listResources(q: { instanceId?: string; backupEnabled?: boolean }) {
    return this.get("/api/v1/resources", q);
  }
  getResource(id: string) {
    return this.get(`/api/v1/resources/${encodeURIComponent(id)}`);
  }
  listSnapshots(q: { resourceId?: string; status?: string; limit?: number }) {
    return this.get("/api/v1/snapshots", q);
  }
  getSnapshot(id: string) {
    return this.get(`/api/v1/snapshots/${encodeURIComponent(id)}`);
  }
  listDestinations() {
    return this.get("/api/v1/destinations");
  }
  listAgents(q: { instanceId?: string }) {
    return this.get("/api/v1/agents", q);
  }
  listJobs(q: { type?: string; status?: string; limit?: number }) {
    return this.get("/api/v1/jobs", q);
  }
  getJob(id: string) {
    return this.get(`/api/v1/jobs/${encodeURIComponent(id)}`);
  }
  backupResource(id: string) {
    return this.post(`/api/v1/resources/${encodeURIComponent(id)}/backup`);
  }
  mirrorSnapshot(id: string) {
    return this.post(`/api/v1/snapshots/${encodeURIComponent(id)}/mirror`);
  }
  verifyDestination(id: string, deep: boolean) {
    return this.post(`/api/v1/destinations/${encodeURIComponent(id)}/verify`, { deep });
  }
}
