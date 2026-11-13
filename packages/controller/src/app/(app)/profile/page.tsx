import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getTwoFactorPolicy, twoFactorRequired } from "@/lib/two-factor";
import { ssoButtons } from "@/lib/sso";
import { ProfileView } from "./profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  // An account that only signs in with GitHub / Google / GitLab has no password
  // to confirm two-factor changes with.
  const accounts = await prisma.account.findMany({ where: { userId: user.id }, select: { providerId: true } });
  const hasPassword = accounts.some((a) => a.providerId === "credential");
  return (
    <ProfileView
      email={user.email}
      firstName={(user as { firstName?: string | null }).firstName ?? ""}
      lastName={(user as { lastName?: string | null }).lastName ?? ""}
      sso={{ providers: await ssoButtons(), linked: accounts.map((a) => a.providerId) }}
      twoFactor={{
        enabled: !!user.twoFactorEnabled,
        required: twoFactorRequired(await getTwoFactorPolicy(), user.role),
        hasPassword,
      }}
    />
  );
}
