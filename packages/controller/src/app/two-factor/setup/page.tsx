import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getTwoFactorPolicy, twoFactorRequired } from "@/lib/two-factor";
import { RequiredSetup } from "./required-setup";

export const dynamic = "force-dynamic";

/**
 * Where an account the admin policy requires two-factor from lands until it is
 * set up (see requireUser). Uses the session directly: requireUser would loop.
 */
export default async function TwoFactorSetupPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const user = session.user;
  if (user.twoFactorEnabled || !twoFactorRequired(await getTwoFactorPolicy(), user.role)) redirect("/");
  const hasPassword = !!(await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" }, select: { id: true } }));
  return <RequiredSetup needsPassword={hasPassword} />;
}
