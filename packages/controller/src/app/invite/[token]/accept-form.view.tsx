"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Badge } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the invite-acceptance card. Logic in ./accept-form.tsx. */
export function AcceptInviteFormView({
  email,
  role,
  password,
  confirm,
  firstName,
  lastName,
  error,
  loading,
  onPasswordChange,
  onConfirmChange,
  onFirstNameChange,
  onLastNameChange,
  onSubmit,
}: {
  email: string;
  role: string;
  password: string;
  confirm: string;
  firstName: string;
  lastName: string;
  error: string | null;
  loading: boolean;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.inviteTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("auth.joiningAs")} <Badge tone="accent">{role}</Badge>
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" value={email} readOnly disabled />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">{t("auth.firstName")}</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => onFirstNameChange(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">{t("auth.lastName")}</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => onLastNameChange(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
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
              <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
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
              {loading ? "…" : t("auth.createAccount")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
