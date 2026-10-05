import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { getT } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { AcceptInviteForm } from "./accept-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getT();
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) } });

  const invalid = !invite || !!invite.acceptedAt;
  const expired = invite && !invite.acceptedAt && invite.expiresAt.getTime() <= Date.now();

  if (invalid || expired) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>{t("auth.inviteUnavailable")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>{expired ? t("auth.inviteExpired") : t("auth.inviteInvalid")}</p>
            <Link href="/login" className="text-accent hover:underline">
              {t("auth.goToSignIn")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AcceptInviteForm token={token} email={invite!.email} role={invite!.role} />;
}
