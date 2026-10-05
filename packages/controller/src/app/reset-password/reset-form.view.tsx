"use client";

import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.resetTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!token ? (
            <p className="text-sm text-[var(--color-danger)]">
              {t("auth.resetMissingTokenPre")}{" "}
              <Link href="/login" className="underline">
                {t("auth.resetMissingTokenLink")}
              </Link>
              {t("auth.resetMissingTokenPost")}
            </p>
          ) : done ? (
            <p className="text-sm text-muted-foreground">{t("auth.resetDone")}</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">{t("auth.newPassword")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">{t("auth.confirmNewPassword")}</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => onConfirmChange(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "…" : t("auth.setNewPassword")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
