/**
 * Minimal Coolify API v4 client. Used by the controller to discover resources.
 * Endpoints used: /api/v1/{applications,databases,services,projects,resources}.
 */

export interface CoolifyResource {
  uuid: string;
  name: string;
  type: string; // normalized (postgresql, application, service, ...)
  rawType: string;
  status: string;
  projectName: string;
  environment: string;
  buildPack?: string;
  environmentId?: number;
}

export class CoolifyClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${this.token}`, accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Coolify GET ${path} -> ${res.status} ${await res.text().catch(() => "")}`);
    }
    return (await res.json()) as T;
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${this.token}`, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Coolify PATCH ${path} -> ${res.status} ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Re-pin a Git application to a specific commit and redeploy, so the running
   * code matches restored data (avoids HEAD drift). The Coolify API stores
   * git_commit_sha = "HEAD" by default; this sets it to the captured SHA.
   */
  async repinCommit(appUuid: string, commitSha: string): Promise<void> {
    await this.patch(`/api/v1/applications/${appUuid}`, { git_commit_sha: commitSha });
    await this.get(`/api/v1/deploy?uuid=${appUuid}&force=true`);
  }

  /** Quick connectivity / auth check. The version endpoint returns plain text. */
  async ping(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/version`, {
        headers: { authorization: `Bearer ${this.token}`, accept: "application/json" },
      });
      const body = (await res.text()).trim();
      if (!res.ok) return { ok: false, error: `${res.status} ${body.slice(0, 200)}` };
      // Coolify may return JSON like {"message":"API is disabled."} with 200.
      if (body.startsWith("{")) {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) return { ok: false, error: parsed.message };
      }
      return { ok: true, version: body.replace(/^"|"$/g, "") };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  private async envMap(): Promise<Map<number, { project: string; environment: string }>> {
    const map = new Map<number, { project: string; environment: string }>();
    try {
      const projects = await this.get<any[]>("/api/v1/projects");
      for (const p of projects ?? []) {
        // The list endpoint usually omits nested environments; fetch detail.
        let envs = p.environments;
        let name = p.name;
        if ((!envs || envs.length === 0) && p.uuid) {
          const detail = await this.get<any>(`/api/v1/projects/${p.uuid}`).catch(() => null);
          if (detail) {
            envs = detail.environments ?? [];
            name = detail.name ?? name;
          }
        }
        for (const e of envs ?? []) {
          if (typeof e.id === "number") {
            map.set(e.id, { project: name ?? "", environment: e.name ?? "" });
          }
        }
      }
    } catch {
      /* projects endpoint optional */
    }
    return map;
  }

  /** Discover all resources, normalized. */
  async listResources(): Promise<CoolifyResource[]> {
    const envs = await this.envMap();
    const out: CoolifyResource[] = [];

    const apps = await this.get<any[]>("/api/v1/applications").catch(() => []);
    for (const a of apps ?? []) {
      out.push(this.normalize(a, "application", envs));
    }
    const dbs = await this.get<any[]>("/api/v1/databases").catch(() => []);
    for (const d of dbs ?? []) {
      out.push(this.normalize(d, undefined, envs));
    }
    const svcs = await this.get<any[]>("/api/v1/services").catch(() => []);
    for (const s of svcs ?? []) {
      out.push(this.normalize(s, "service", envs));
    }
    return out;
  }

  private normalize(
    r: any,
    forcedType: string | undefined,
    envs: Map<number, { project: string; environment: string }>,
  ): CoolifyResource {
    const rawType: string = forcedType ?? r.type ?? r.database_type ?? "unknown";
    const type = normalizeType(rawType);
    const envId: number | undefined = r.environment_id;
    const env = envId !== undefined ? envs.get(envId) : undefined;
    return {
      uuid: r.uuid,
      name: r.name ?? r.uuid,
      type,
      rawType,
      status: typeof r.status === "string" ? r.status : "unknown",
      projectName: env?.project ?? r.project_name ?? "",
      environment: env?.environment ?? "",
      buildPack: r.build_pack ?? undefined,
      environmentId: envId,
    };
  }
}

export function normalizeType(raw: string): string {
  const t = raw.replace(/^standalone-/, "");
  const known = [
    "postgresql",
    "mysql",
    "mariadb",
    "mongodb",
    "redis",
    "keydb",
    "dragonfly",
    "clickhouse",
    "application",
    "service",
  ];
  return known.includes(t) ? t : t;
}
