"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-errors";
import { useT } from "@/components/i18n-provider";
import { ResetPasswordFormView } from "./reset-form.view";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("auth.passwordTooShort"));
    if (password !== confirm) return setError(t("auth.passwordMismatch"));
    setLoading(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) setError(authErrorText(res.error, t, "auth.resetFailed"));
      else {
        setDone(true);
        setTimeout(() => router.push("/login"), 1500);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ResetPasswordFormView
      token={token}
      password={password}
      confirm={confirm}
      error={error}
      done={done}
      loading={loading}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirm}
      onSubmit={submit}
    />
  );
}
