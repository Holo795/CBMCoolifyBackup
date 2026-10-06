import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getTwoFactorPolicy, twoFactorRequired } from "@/lib/two-factor";
import { ProfileView } from "./profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  // An account that only signs in with GitHub / Google / GitLab has no password
  // to confirm two-factor changes with.
  const hasPassword = !!(await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" }, select: { id: true } }));
  return (
    <ProfileView
      email={user.email}
      firstName={(user as { firstName?: string | null }).firstName ?? ""}
      lastName={(user as { lastName?: string | null }).lastName ?? ""}
      twoFactor={{
        enabled: !!user.twoFactorEnabled,
        required: twoFactorRequired(await getTwoFactorPolicy(), user.role),
        hasPassword,
      }}
    />
  );
}
