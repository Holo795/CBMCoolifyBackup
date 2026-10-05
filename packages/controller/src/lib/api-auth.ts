import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { sha256Hex } from "./crypto";
import { ROLE_RANK, roleRank, type Role } from "./roles";

/**
 * Bearer-token auth for the `/api/v1` programmatic surface (the MCP server and
 * any external AI agent). Mirrors the agent token scheme: the client sends
 * `Authorization: Bearer <token>`, we store only the sha256 hash, and each token
 * carries its own role that gates exactly what a user of that role could do.
 */
export type ApiPrincipal = { id: string; name: string; role: Role };

/** Resolve the API token from a request, or null if missing/invalid/expired. */
export async function authenticateApiTokenFromRequest(req: Request): Promise<ApiPrincipal | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = await prisma.apiToken.findUnique({ where: { tokenHash: sha256Hex(m[1].trim()) } });
  if (!token) return null;
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return null;

  // Best-effort last-used stamp; never let it fail the request.
  void prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const role: Role = roleRank(token.role) >= ROLE_RANK.admin ? "admin" : roleRank(token.role) >= ROLE_RANK.operator ? "operator" : "viewer";
  return { id: token.id, name: token.name, role };
}

type ApiAuth = { ok: true; principal: ApiPrincipal } | { ok: false; response: NextResponse };

/**
 * Gate a route handler. Returns the principal when the token is valid and meets
 * `min` (default "viewer"); otherwise a ready-to-return 401/403 JSON response.
 *
 *   const auth = await requireApi(req, "operator");
 *   if (!auth.ok) return auth.response;
 *   // ... auth.principal.role / .id
 */
export async function requireApi(req: Request, min: Role = "viewer"): Promise<ApiAuth> {
  const principal = await authenticateApiTokenFromRequest(req);
  if (!principal) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (roleRank(principal.role) < ROLE_RANK[min]) {
    return { ok: false, response: NextResponse.json({ error: "forbidden", need: min }, { status: 403 }) };
  }
  return { ok: true, principal };
}
