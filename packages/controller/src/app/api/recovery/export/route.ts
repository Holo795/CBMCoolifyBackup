import { NextRequest, NextResponse } from "next/server";
import { auth, verifyUserPassword } from "@/lib/auth";
import { can } from "@/lib/roles";
import { buildRecoveryFile } from "@/lib/recovery-file";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Generate + stream the recovery file (reveal-once: never persisted server-side).
 * Crown-jewels download: admin session AND a fresh password check (step-up).
 */
export async function POST(req: NextRequest) {
  const t = await getT();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: t("messages.recoveryUnauthorized") }, { status: 401 });
  if (!can(session.user, "admin")) return NextResponse.json({ error: t("messages.recoveryAdminsOnly") }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!(await verifyUserPassword(session.user.id, body.password ?? ""))) {
    return NextResponse.json({ error: t("messages.recoveryWrongPassword") }, { status: 403 });
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
    console.error("[recovery/export] failed:", (e as Error).message);
    return NextResponse.json({ error: t("messages.recoveryExportFailed") }, { status: 500 });
  }
}
