import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { AcceptInviteForm } from "./accept-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) } });

  const invalid = !invite || !!invite.acceptedAt;
  const expired = invite && !invite.acceptedAt && invite.expiresAt.getTime() <= Date.now();

  if (invalid || expired) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Invitation unavailable</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              {expired
                ? "This invitation link has expired. Ask an admin to send you a new one."
                : "This invitation link is invalid or has already been used."}
            </p>
            <Link href="/login" className="text-accent hover:underline">
              Go to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AcceptInviteForm token={token} email={invite!.email} role={invite!.role} />;
}
