import { NextRequest, NextResponse } from "next/server";
import { auth, verifyUserPassword } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getTwoFactorPolicy, twoFactorRequired } from "@/lib/two-factor";
import { buildRecoveryFile } from "@/lib/recovery-file";
import { getT } from "@/lib/i18n";
import { UserError } from "@/lib/user-error";
import { verifyTotpCode } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/**
 * Generate + stream the recovery file (reveal-once: never persisted server-side).
 * Crown-jewels download: admin session AND a fresh password check (step-up).
 */
export async function POST(req: NextRequest) {
  const t = await getT();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: t("messages.recoveryUnauthorized") }, { status: 401 });
  // The two-factor policy applies here like on the pages (lib/api-session).
  if (!session.user.twoFactorEnabled && twoFactorRequired(await getTwoFactorPolicy(), session.user.role)) {
    return NextResponse.json({ error: t("messages.recoveryNeeds2fa") }, { status: 403 });
  }
  if (!can(session.user, "admin")) return NextResponse.json({ error: t("messages.recoveryAdminsOnly") }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { password?: string; passphrase?: string; kind?: string; code?: string };
  if (!(await verifyUserPassword(session.user.id, body.password ?? ""))) {
    return NextResponse.json({ error: t("messages.recoveryWrongPassword") }, { status: 403 });
  }
  // An account with two-factor proves it again: the file opens the whole install.
  if (session.user.twoFactorEnabled && !(await verifyTotpCode(req.headers, body.code ?? ""))) {
    return NextResponse.json({ error: t("messages.recoveryWrongCode") }, { status: 403 });
  }

  try {
    const { filename, content } = await buildRecoveryFile({
      passphrase: body.passphrase ?? "",
      kind: body.kind === "full" ? "full" : "light",
    });
    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: t(e.key, e.vars) }, { status: 400 });
    console.error("[recovery/export] failed:", (e as Error).message);
    return NextResponse.json({ error: t("messages.recoveryExportFailed") }, { status: 500 });
  }
}
