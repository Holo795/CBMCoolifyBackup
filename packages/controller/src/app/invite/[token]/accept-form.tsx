"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorText, ssoErrorText } from "@/lib/auth-errors";
import { useT } from "@/components/i18n-provider";
import { claimInvitation } from "@/app/actions";
import type { OAuthProvider } from "@/lib/auth";
import type { SsoButton } from "@/lib/sso";
import { AcceptInviteFormView } from "./accept-form.view";

/**
 * Invite acceptance: claim the invite (proves token possession, flips the
 * registration gate open for this email), then sign up. Markup lives in
 * ./accept-form.view.tsx.
 */
export function AcceptInviteForm({
  token,
  email,
  role,
  providers,
  ssoError,
}: {
  token: string;
  email: string;
  role: string;
  /** Social providers the invitee can sign up with instead of a password. */
  providers: SsoButton[];
  /** Code of a single sign-on that failed (?error=). */
  ssoError?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(() => ssoErrorText(ssoError, t));
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("auth.passwordTooShort"));
    if (password !== confirm) return setError(t("auth.passwordMismatch"));
    setLoading(true);
    try {
      const claim = await claimInvitation(token);
      if (claim.error || !claim.email) {
        setError(claim.error ?? t("auth.inviteNoLongerValid"));
        return;
      }
      const name = `${firstName} ${lastName}`.trim() || claim.email.split("@")[0];
      // firstName/lastName are additional fields; pass via a variable so TS keeps
      // them (object literals would trip the excess-property check).
      const signUpBody = { email: claim.email, password, name, firstName, lastName };
      const res = await authClient.signUp.email(signUpBody);
      if (res.error) setError(authErrorText(res.error, t, "auth.createAccountFailed"));
      else router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Social sign-up: claim the invite first (the registration gate needs it),
  // then hand over to the provider; it must return this invite's email.
  async function onProvider(provider: OAuthProvider) {
    setError(null);
    const claim = await claimInvitation(token);
    if (claim.error) return setError(claim.error);
    await authClient.signIn.social({ provider, callbackURL: "/", errorCallbackURL: `/invite/${token}` });
  }

  return (
    <AcceptInviteFormView
      providers={providers}
      onProvider={onProvider}
      email={email}
      role={role}
      password={password}
      confirm={confirm}
      firstName={firstName}
      lastName={lastName}
      error={error}
      loading={loading}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirm}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onSubmit={submit}
    />
  );
}
