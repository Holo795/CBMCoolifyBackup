"use client";

import { Button, Input, Field } from "@/components/ui";
import { GithubIcon } from "@/components/icons/github";
import { GoogleIcon } from "@/components/icons/google";
import { GitlabIcon } from "@/components/icons/gitlab";
import type { OAuthProvider } from "@/lib/auth";
import { useT } from "@/components/i18n-provider";
import { AuthShell, AuthMessage } from "@/components/auth-shell";

const PROVIDER_ICON = { github: GithubIcon, google: GoogleIcon, gitlab: GitlabIcon };

/** Presentation only: the login / forgot-password card. Logic in ./login-form.tsx. */
export function LoginFormView({
  needsSetup,
  providers,
  forgot,
  email,
  password,
  firstName,
  lastName,
  error,
  notice,
  loading,
  showForgotToggle,
  onEmailChange,
  onPasswordChange,
  onFirstNameChange,
  onLastNameChange,
  onSubmit,
  onToggleForgot,
  onProvider,
}: {
  needsSetup: boolean;
  providers: OAuthProvider[];
  forgot: boolean;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  error: string | null;
  notice: string | null;
  loading: boolean;
  showForgotToggle: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onToggleForgot: () => void;
  onProvider: (p: OAuthProvider) => void;
}) {
  const t = useT();
  const title = forgot ? t("auth.forgotPassword") : needsSetup ? t("auth.createAdmin") : t("auth.signIn");
  const description = forgot ? t("auth.forgotPrompt") : needsSetup ? t("auth.createAdminTitle") : t("auth.signInSubtitle");
  const forgotLink = showForgotToggle && (
    <button
      type="button"
      className="text-[13px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:underline"
      onClick={onToggleForgot}
    >
      {forgot ? t("auth.backToSignIn") : t("auth.forgotPassword")}
    </button>
  );

  return (
    <AuthShell title={title} description={description} footer={forgot ? forgotLink : null}>
      <div className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {needsSetup && !forgot && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("auth.firstName")} htmlFor="firstName">
                <Input id="firstName" value={firstName} onChange={(e) => onFirstNameChange(e.target.value)} autoComplete="given-name" />
              </Field>
              <Field label={t("auth.lastName")} htmlFor="lastName">
                <Input id="lastName" value={lastName} onChange={(e) => onLastNameChange(e.target.value)} autoComplete="family-name" />
              </Field>
            </div>
          )}
          <Field label={t("auth.email")} htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} autoComplete="email" autoFocus required />
          </Field>
          {!forgot && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="password" className="text-[13px] font-medium">
                  {t("auth.password")}
                </label>
                {forgotLink}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoComplete={needsSetup ? "new-password" : "current-password"}
                required
                minLength={8}
              />
            </div>
          )}
          {error && <AuthMessage tone="error">{error}</AuthMessage>}
          {notice && <AuthMessage tone="info">{notice}</AuthMessage>}
          <Button type="submit" variant="primary" loading={loading} className="w-full">
            {forgot ? t("auth.sendResetLink") : needsSetup ? t("auth.createAdmin") : t("auth.signIn")}
          </Button>
        </form>

        {providers.length > 0 && !forgot && (
          <>
            <div className="flex items-center gap-3 text-xs text-subtle-foreground">
              <div className="h-px flex-1 bg-border" /> {t("auth.or")} <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              {providers.map((p) => {
                const Icon = PROVIDER_ICON[p];
                return (
                  <Button key={p} type="button" onClick={() => onProvider(p)} className="w-full">
                    <Icon className="size-4" /> {t(`auth.continueWith.${p}`)}
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
