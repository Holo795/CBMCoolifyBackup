import { NextRequest, NextResponse } from "next/server";
import { auth, verifyUserPassword } from "@/lib/auth";
import { can } from "@/lib/roles";
import { buildRecoveryFile } from "@/lib/recovery-file";

export const dynamic = "force-dynamic";

/**
 * Generate + stream the recovery file (reveal-once: never persisted server-side).
 * Crown-jewels download: admin session AND a fresh password check (step-up).
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user, "admin")) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!(await verifyUserPassword(session.user.id, body.password ?? ""))) {
    return NextResponse.json({ error: "Wrong password" }, { status: 403 });
  }

  try {
    const { filename, content } = await buildRecoveryFile();
    return new NextResponse(content, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
