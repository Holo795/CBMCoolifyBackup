"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { AuthShell, AuthMessage } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-errors";

/**
 * Enter the authenticator code (or a backup code) to finish signing in. The
 * pending sign-in lives in the two-factor plugin's short-lived cookie.
 */
export function TwoFactorVerifyForm() {
  const t = useT();
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const value = code.trim().replace(backup ? /\s/g : /[\s-]/g, "");
    const r = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust });
    if (r.error) {
      setPending(false);
      setError(authErrorText(r.error, t, "auth.authFailed"));
      return;
    }
    // A full load, so the app shell starts with the new session.
    window.location.href = "/";
  };

  return (
    <AuthShell
      title={t("twofactor.challengeTitle")}
      description={backup ? t("twofactor.challengeBackupDesc") : t("twofactor.challengeDesc")}
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t("twofactor.backToSignIn")}
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={backup ? t("twofactor.backupCode") : t("twofactor.code")} htmlFor="tf-verify">
          <Input
            key={backup ? "backup" : "totp"}
            id="tf-verify"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            maxLength={backup ? 32 : 7}
            className="text-center font-mono text-base tracking-[0.3em]"
            autoFocus
            required
          />
        </Field>
        <label htmlFor="tf-trust" className="flex cursor-pointer items-center gap-2.5 text-[13px]">
          <Checkbox id="tf-trust" checked={trust} onCheckedChange={(v) => setTrust(v === true)} />
          {t("twofactor.trustDevice")}
        </label>
        {error && <AuthMessage tone="error">{error}</AuthMessage>}
        <Button type="submit" variant="primary" loading={pending} className="w-full">
          {t("twofactor.verify")}
        </Button>
        <button
          type="button"
          className="text-[13px] font-medium text-accent hover:underline focus-visible:underline focus-visible:outline-none"
          onClick={() => {
            setBackup(!backup);
            setCode("");
            setError(null);
          }}
        >
          {backup ? t("twofactor.useApp") : t("twofactor.useBackup")}
        </button>
      </form>
    </AuthShell>
  );
}
