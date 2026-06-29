"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ResetPasswordFormView } from "./reset-form.view";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setLoading(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) setError(res.error.message ?? "Could not reset your password");
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
