import { NextRequest, NextResponse } from "next/server";
import { auth, verifyUserPassword } from "@/lib/auth";
import { can } from "@/lib/roles";
import { parseRecoveryFile, importGuards, isEmptyish, importRecoveryFile } from "@/lib/recovery-file";

export const dynamic = "force-dynamic";
// pg_restore + re-encryption can take a while on a big metadata DB.
export const maxDuration = 300;

/**
 * Import a recovery file on a fresh install: restore the latest self-backup
 * (fallback: the embedded dump) and re-encrypt every secret under THIS
 * install's master key. Destructive — guarded by admin + password + typed
 * confirmation, and refused on a non-empty install unless overridden.
 *
 * NOTE: the restored database replaces every account — the current session
 * ends and the operator signs back in with their OLD credentials.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user, "admin")) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const override = form.get("override") === "true";
  const upload = form.get("file");

  if (!(await verifyUserPassword(session.user.id, password))) {
    return NextResponse.json({ error: "Wrong password" }, { status: 403 });
  }
  if (confirm !== "IMPORT") {
    return NextResponse.json({ error: 'Type "IMPORT" to confirm overwriting this install' }, { status: 400 });
  }
  if (!(upload instanceof File)) return NextResponse.json({ error: "No recovery file uploaded" }, { status: 400 });

  try {
    const file = parseRecoveryFile(await upload.text());
    const guard = await importGuards(file);
    if (guard.error) return NextResponse.json({ error: guard.error }, { status: 400 });
    if (!override && !(await isEmptyish())) {
      return NextResponse.json(
        { error: "This install already has instances/destinations. Tick the override to replace everything." },
        { status: 400 },
      );
    }

    const { source } = await importRecoveryFile(file);
    return NextResponse.json({
      ok: true,
      source,
      detail:
        source === "latest"
          ? "Restored the latest self-backup from its destination."
          : "The self-backup destination was unreachable - restored the dump embedded in the recovery file.",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
