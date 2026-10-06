"use client";

import Link from "next/link";
import { Button, Input, Field } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { AuthShell, AuthMessage } from "@/components/auth-shell";

/** Presentation only: the reset-password card. Logic in ./reset-form.tsx. */
export function ResetPasswordFormView({
  token,
  password,
  confirm,
  error,
  done,
  loading,
  onPasswordChange,
  onConfirmChange,
  onSubmit,
}: {
  token: string;
  password: string;
  confirm: string;
  error: string | null;
  done: boolean;
  loading: boolean;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const t = useT();
  return (
    <AuthShell
      title={t("auth.resetTitle")}
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      }
    >
      {!token ? (
        <AuthMessage tone="error">
          {t("auth.resetMissingTokenPre")}{" "}
          <Link href="/login" className="underline">
            {t("auth.resetMissingTokenLink")}
          </Link>
          {t("auth.resetMissingTokenPost")}
        </AuthMessage>
      ) : done ? (
        <AuthMessage tone="info">{t("auth.resetDone")}</AuthMessage>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label={t("auth.newPassword")} htmlFor="password">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoComplete="new-password"
              autoFocus
              required
              minLength={8}
            />
          </Field>
          <Field label={t("auth.confirmNewPassword")} htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => onConfirmChange(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
          {error && <AuthMessage tone="error">{error}</AuthMessage>}
          <Button type="submit" variant="primary" loading={loading} className="w-full">
            {t("auth.setNewPassword")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
