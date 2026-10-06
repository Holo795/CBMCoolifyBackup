"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button, Field, Input } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-errors";
import { BackupCodes } from "./backup-codes";

/** The base32 secret inside an otpauth:// URI, for typing it in by hand. */
function secretOf(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

/**
 * Turn on two-factor sign-in: confirm the password (accounts that have one),
 * scan the QR code, prove it with a first code, then keep the backup codes.
 * `onDone` runs once the codes have been seen.
 */
export function TwoFactorSetup({ needsPassword, onDone }: { needsPassword: boolean; onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState<"start" | "scan" | "codes">("start");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await authClient.twoFactor.enable(needsPassword ? { password } : ({} as { password: string }));
    setPending(false);
    if (r.error || !r.data || !("totpURI" in r.data)) return setError(authErrorText(r.error, t, "common.error"));
    setUri(r.data.totpURI);
    setCodes(r.data.backupCodes);
    setPassword("");
    setStep("scan");
  };

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setPending(false);
    if (r.error) return setError(authErrorText(r.error, t, "common.error"));
    setStep("codes");
  };

  const errorBox = error && (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
      {error}
    </p>
  );

  if (step === "start")
    return (
      <form onSubmit={start} className="flex flex-col gap-4">
        {needsPassword && (
          <Field label={t("twofactor.password")} htmlFor="tf-password" hint={t("twofactor.stepPassword")}>
            <Input
              id="tf-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Field>
        )}
        {errorBox}
        <div>
          <Button type="submit" variant="primary" loading={pending}>
            {t("twofactor.start")}
          </Button>
        </div>
      </form>
    );

  if (step === "scan")
    return (
      <form onSubmit={activate} className="flex flex-col gap-4">
        <p className="text-[13px] leading-5 text-muted-foreground">{t("twofactor.stepScan")}</p>
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {/* Always dark on white: authenticator apps read that best, in both themes. */}
          <div className="shrink-0 rounded-lg border bg-white p-3">
            <QRCodeSVG value={uri} size={168} marginSize={0} title={t("twofactor.qrTitle")} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
            <span className="text-muted-foreground">{t("twofactor.manualKey")}</span>
            <code className="break-all rounded-md border bg-surface px-2.5 py-1.5 font-mono text-xs tracking-wider">{secretOf(uri)}</code>
          </div>
        </div>
        <Field label={t("twofactor.code")} htmlFor="tf-code">
          <Input
            id="tf-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            className="w-40 font-mono tracking-widest"
            autoFocus
            required
          />
        </Field>
        {errorBox}
        <div>
          <Button type="submit" variant="primary" loading={pending}>
            {t("twofactor.activate")}
          </Button>
        </div>
      </form>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-5 text-muted-foreground">{t("twofactor.stepCodes")}</p>
      <BackupCodes codes={codes} />
      <div>
        <Button variant="primary" onClick={onDone}>
          {t("twofactor.done")}
        </Button>
      </div>
    </div>
  );
}
