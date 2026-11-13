import { prisma } from "@/lib/prisma";
import { ssoButtons } from "@/lib/sso";
import { smtpReady } from "@/lib/email";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; setup?: string }>;
}) {
  const { error, setup } = await searchParams;
  // No users yet -> first registration, with the setup token from the logs
  // (?setup= prefills it), creates the admin (then sign-up closes).
  const needsSetup = (await prisma.user.count()) === 0;
  // Forgot-password needs a working mailer.
  const canReset = await smtpReady();
  return (
    <LoginForm
      needsSetup={needsSetup}
      initialSetupToken={needsSetup ? (setup ?? "") : ""}
      providers={await ssoButtons()}
      ssoError={error}
      canReset={canReset}
    />
  );
}
