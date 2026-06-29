"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LoginFormView } from "./login-form.view";

/**
 * needsSetup = there are no users yet, so this first registration creates the
 * admin. Once an account exists, registration is closed (enforced server-side
 * in lib/auth.ts) and we only show the sign-in form. canReset = SMTP works, so
 * the "Forgot password?" flow is offered. Markup lives in ./login-form.view.tsx.
 */
export function LoginForm({
  needsSetup,
  hasGithub,
  canReset,
}: {
  needsSetup: boolean;
  hasGithub: boolean;
  canReset: boolean;
}) {
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
        setNotice("If an account exists for that address, a reset link is on its way.");
        return;
      }
      const name = `${firstName} ${lastName}`.trim() || email.split("@")[0];
      // firstName/lastName are additional fields; pass via a variable so TS keeps
      // them (object literals would trip the excess-property check).
      const signUpBody = { email, password, name, firstName, lastName };
      const res = await (needsSetup ? authClient.signUp.email(signUpBody) : authClient.signIn.email({ email, password }));
      if (res.error) setError(res.error.message ?? "Authentication failed");
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
      hasGithub={hasGithub}
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
      onGithub={() => authClient.signIn.social({ provider: "github" })}
    />
  );
}
