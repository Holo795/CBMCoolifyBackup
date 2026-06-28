import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { smtpReady } from "@/lib/email";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // No users yet -> first registration creates the admin (then sign-up closes).
  const needsSetup = (await prisma.user.count()) === 0;
  const hasGithub = !!(env.oauth.githubClientId && env.oauth.githubClientSecret);
  // Forgot-password needs a working mailer.
  const canReset = await smtpReady();
  return <LoginForm needsSetup={needsSetup} hasGithub={hasGithub} canReset={canReset} />;
}
