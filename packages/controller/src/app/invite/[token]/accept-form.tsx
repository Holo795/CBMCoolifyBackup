"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { claimInvitation } from "@/app/actions";
import { AcceptInviteFormView } from "./accept-form.view";

/**
 * Invite acceptance: claim the invite (proves token possession, flips the
 * registration gate open for this email), then sign up. Markup lives in
 * ./accept-form.view.tsx.
 */
export function AcceptInviteForm({ token, email, role }: { token: string; email: string; role: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setLoading(true);
    try {
      const claim = await claimInvitation(token);
      if (claim.error || !claim.email) {
        setError(claim.error ?? "This invitation is no longer valid.");
        return;
      }
      const name = `${firstName} ${lastName}`.trim() || claim.email.split("@")[0];
      // firstName/lastName are additional fields; pass via a variable so TS keeps
      // them (object literals would trip the excess-property check).
      const signUpBody = { email: claim.email, password, name, firstName, lastName };
      const res = await authClient.signUp.email(signUpBody);
      if (res.error) setError(res.error.message ?? "Could not create your account");
      else router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AcceptInviteFormView
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
