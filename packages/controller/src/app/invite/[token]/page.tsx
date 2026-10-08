import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { getT } from "@/lib/i18n";
import { AuthShell, AuthMessage } from "@/components/auth-shell";
import { AcceptInviteForm } from "./accept-form";
import { ssoButtons } from "@/lib/sso";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const t = await getT();
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) } });

  const invalid = !invite || !!invite.acceptedAt;
  const expired = invite && !invite.acceptedAt && invite.expiresAt.getTime() <= Date.now();

  if (invalid || expired) {
    return (
      <AuthShell
        title={t("auth.inviteUnavailable")}
        footer={
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t("auth.goToSignIn")}
          </Link>
        }
      >
        <AuthMessage tone="info">{expired ? t("auth.inviteExpired") : t("auth.inviteInvalid")}</AuthMessage>
      </AuthShell>
    );
  }

  return <AcceptInviteForm token={token} email={invite!.email} role={invite!.role} providers={await ssoButtons()} ssoError={error} />;
}
