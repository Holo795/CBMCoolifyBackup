"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { DatabaseBackup, Github } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";

/** Presentation only: the login / forgot-password card. Logic in ./login-form.tsx. */
export function LoginFormView({
  needsSetup,
  hasGithub,
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
  onGithub,
}: {
  needsSetup: boolean;
  hasGithub: boolean;
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
  onGithub: () => void;
}) {
  const t = useT();
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <DatabaseBackup className="h-6 w-6" />
          </div>
          <CardTitle>{t("auth.appName")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {forgot ? t("auth.forgotPrompt") : needsSetup ? t("auth.createAdminTitle") : t("auth.signInSubtitle")}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {needsSetup && !forgot && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">{t("auth.firstName")}</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => onFirstNameChange(e.target.value)} autoComplete="given-name" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">{t("auth.lastName")}</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => onLastNameChange(e.target.value)} autoComplete="family-name" />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} required />
            </div>
            {!forgot && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            )}
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "…" : forgot ? t("auth.sendResetLink") : needsSetup ? t("auth.createAdmin") : t("auth.signIn")}
            </Button>
          </form>

          {showForgotToggle && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={onToggleForgot}>
              {forgot ? t("auth.backToSignIn") : t("auth.forgotPassword")}
            </button>
          )}

          {hasGithub && !forgot && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> {t("auth.or")} <div className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" onClick={onGithub}>
                <Github className="h-4 w-4" /> {t("auth.continueWithGithub")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
