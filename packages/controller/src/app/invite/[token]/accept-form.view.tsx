"use client";

import { Button, Input, Field, Badge } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { AuthShell, AuthMessage } from "@/components/auth-shell";
import { OAuthButtons } from "@/components/oauth-buttons";
import type { OAuthProvider } from "@/lib/auth";

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
  providers,
  onProvider,
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
  providers: OAuthProvider[];
  onProvider: (p: OAuthProvider) => void;
}) {
  const t = useT();
  return (
    <AuthShell
      title={t("auth.inviteTitle")}
      description={
        <span className="inline-flex items-center gap-1.5">
          {t("auth.joiningAs")} <Badge tone="accent">{t(`users.roles.${role}`)}</Badge>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" type="email" value={email} autoComplete="username" readOnly disabled />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("auth.firstName")} htmlFor="firstName">
            <Input id="firstName" value={firstName} onChange={(e) => onFirstNameChange(e.target.value)} autoComplete="given-name" autoFocus />
          </Field>
          <Field label={t("auth.lastName")} htmlFor="lastName">
            <Input id="lastName" value={lastName} onChange={(e) => onLastNameChange(e.target.value)} autoComplete="family-name" />
          </Field>
        </div>
        <Field label={t("auth.password")} htmlFor="password">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Field label={t("auth.confirmPassword")} htmlFor="confirm">
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
          {t("auth.createAccount")}
        </Button>
      </form>
      {providers.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <OAuthButtons providers={providers} onProvider={onProvider} />
          <p className="text-center text-xs text-muted-foreground">{t("auth.inviteProviderHint", { email })}</p>
        </div>
      )}
    </AuthShell>
  );
}
