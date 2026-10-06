"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-errors";
import { useT } from "@/components/i18n-provider";
import type { OAuthProvider } from "@/lib/auth";
import { LoginFormView } from "./login-form.view";

/**
 * needsSetup = there are no users yet, so this first registration creates the
 * admin. Once an account exists, registration is closed (enforced server-side
 * in lib/auth.ts) and we only show the sign-in form. canReset = SMTP works, so
 * the "Forgot password?" flow is offered. Markup lives in ./login-form.view.tsx.
 */
export function LoginForm({
  needsSetup,
  providers,
  canReset,
}: {
  needsSetup: boolean;
  /** Social sign-in providers configured on the server. */
  providers: OAuthProvider[];
  canReset: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"auth" | "forgot">("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const forgot = mode === "forgot";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setNotice(t("auth.resetSent"));
        return;
      }
      const name = `${firstName} ${lastName}`.trim() || email.split("@")[0];
      // firstName/lastName are additional fields; pass via a variable so TS keeps
      // them (object literals would trip the excess-property check).
      const signUpBody = { email, password, name, firstName, lastName };
      const res = await (needsSetup ? authClient.signUp.email(signUpBody) : authClient.signIn.email({ email, password }));
      if (res.error) setError(authErrorText(res.error, t, "auth.authFailed"));
      // A second factor is due: the auth client is already on its way to /two-factor.
      else if (res.data && "twoFactorRedirect" in res.data) return;
      else router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginFormView
      needsSetup={needsSetup}
      providers={providers}
      forgot={forgot}
      email={email}
      password={password}
      firstName={firstName}
      lastName={lastName}
      error={error}
      notice={notice}
      loading={loading}
      showForgotToggle={!needsSetup && canReset}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onSubmit={submit}
      onToggleForgot={() => {
        setError(null);
        setNotice(null);
        setMode(forgot ? "auth" : "forgot");
      }}
      onProvider={(provider) => authClient.signIn.social({ provider })}
    />
  );
}
