import { NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** Cheap token check: who am I and what can I do. Any valid token passes. */
export async function GET(req: Request) {
  const auth = await requireApi(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ api: "v1", token: { name: auth.principal.name, role: auth.principal.role } });
}
