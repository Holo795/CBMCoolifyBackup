import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { sha256Hex } from "./crypto";
import { ROLE_RANK, roleRank, type Role } from "./roles";
import { createRateLimiter, clientIp } from "./rate-limit";

/**
 * Bearer-token auth for the `/api/v1` programmatic surface (the MCP server and
 * any external AI agent). Mirrors the agent token scheme: the client sends
 * `Authorization: Bearer <token>`, we store only the sha256 hash, and each token
 * carries its own role that gates exactly what a user of that role could do.
 */
export type ApiPrincipal = { id: string; name: string; role: Role };

/** Per-IP request budget for the whole /api/v1 surface. Checked before the
 * token lookup so guessing tokens is throttled even with no valid credential. */
const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 240 });
let lastSweep = 0;

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function parseBearer(header: string | null | undefined): string | null {
  const m = (header ?? "").match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

/** Has the token passed its optional expiry? */
export function tokenExpired(expiresAt: Date | null | undefined, now = Date.now()): boolean {
  return expiresAt != null && expiresAt.getTime() <= now;
}

/** Collapse a stored role string to a known Role (unknown → viewer, the safest). */
export function normalizeRole(role: string | null | undefined): Role {
  const r = roleRank(role);
  return r >= ROLE_RANK.admin ? "admin" : r >= ROLE_RANK.operator ? "operator" : "viewer";
}

/** Resolve the API token from a request, or null if missing/invalid/expired. */
export async function authenticateApiTokenFromRequest(req: Request): Promise<ApiPrincipal | null> {
  const raw = parseBearer(req.headers.get("authorization"));
  if (!raw) return null;
  const token = await prisma.apiToken.findUnique({ where: { tokenHash: sha256Hex(raw) } });
  if (!token || tokenExpired(token.expiresAt)) return null;

  // Best-effort last-used stamp; never let it fail the request.
  void prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { id: token.id, name: token.name, role: normalizeRole(token.role) };
}

type ApiAuth = { ok: true; principal: ApiPrincipal } | { ok: false; response: NextResponse };

/**
 * Gate a route handler. Returns the principal when the request is within its
 * rate budget, the token is valid, and it meets `min` (default "viewer");
 * otherwise a ready-to-return 429/401/403 JSON response.
 *
 *   const auth = await requireApi(req, "operator");
 *   if (!auth.ok) return auth.response;
 */
export async function requireApi(req: Request, min: Role = "viewer"): Promise<ApiAuth> {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    apiLimiter.sweep(now);
    lastSweep = now;
  }
  const rl = apiLimiter.check(`ip:${clientIp(req)}`, now);
  if (!rl.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate limited" },
        { status: 429, headers: { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      ),
    };
  }

  const principal = await authenticateApiTokenFromRequest(req);
  if (!principal) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (roleRank(principal.role) < ROLE_RANK[min]) {
    return { ok: false, response: NextResponse.json({ error: "forbidden", need: min }, { status: 403 }) };
  }
  return { ok: true, principal };
}
