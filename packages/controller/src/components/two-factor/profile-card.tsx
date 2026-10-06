"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, Field, Input } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-errors";
import { TwoFactorSetup } from "./setup";
import { BackupCodes } from "./backup-codes";

/** Profile card: turn two-factor sign-in on or off, renew the backup codes. */
export function TwoFactorCard({ enabled, required, hasPassword }: { enabled: boolean; required: boolean; hasPassword: boolean }) {
  const t = useT();
  const router = useRouter();
  const [dialog, setDialog] = useState<"setup" | "codes" | "disable" | null>(null);
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (d: typeof dialog) => {
    setPassword("");
    setCodes(null);
    setError(null);
    setDialog(d);
  };
  const close = () => {
    setDialog(null);
    router.refresh();
  };
  const pw = () => (hasPassword ? { password } : ({} as { password: string }));

  const regenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await authClient.twoFactor.generateBackupCodes(pw());
    setPending(false);
    if (r.error || !r.data) return setError(authErrorText(r.error, t, "common.error"));
    setCodes(r.data.backupCodes);
    toast.success(t("twofactor.regenerated"));
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await authClient.twoFactor.disable(pw());
    setPending(false);
    if (r.error) return setError(authErrorText(r.error, t, "common.error"));
    toast.success(t("twofactor.disabled"));
    close();
  };

  const passwordField = hasPassword && (
    <Field label={t("twofactor.passwordFor")} htmlFor="tf-confirm">
      <Input
        id="tf-confirm"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        autoFocus
        required
      />
    </Field>
  );
  const errorBox = error && (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
      {error}
    </p>
  );

  return (
    <Card id="two-factor" className="scroll-mt-8">
      <CardHeader
        actions={
          <Badge tone={enabled ? "success" : "neutral"} dot>
            {enabled ? t("twofactor.statusOn") : t("twofactor.statusOff")}
          </Badge>
        }
      >
        <CardTitle>{t("twofactor.cardTitle")}</CardTitle>
        <CardDescription>{t("twofactor.cardDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {required && <span className="mr-auto text-[13px] text-muted-foreground">{t("twofactor.requiredByPolicy")}</span>}
        {enabled ? (
          <>
            <Button size="sm" onClick={() => open("codes")}>
              <KeyRound /> {t("twofactor.regenerate")}
            </Button>
            {!required && (
              <Button size="sm" variant="danger-ghost" onClick={() => open("disable")}>
                <ShieldOff /> {t("twofactor.disable")}
              </Button>
            )}
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={() => open("setup")}>
            <ShieldCheck /> {t("twofactor.enable")}
          </Button>
        )}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(v) => !v && close()}>
        {dialog === "setup" && (
          <DialogContent title={t("twofactor.setupTitle")}>
            <TwoFactorSetup needsPassword={hasPassword} onDone={close} />
          </DialogContent>
        )}
        {dialog === "codes" && (
          <DialogContent title={t("twofactor.regenerateTitle")} description={codes ? undefined : t("twofactor.regenerateBody")}>
            {codes ? (
              <div className="flex flex-col gap-4">
                <BackupCodes codes={codes} />
                <div>
                  <Button variant="primary" onClick={close}>
                    {t("twofactor.done")}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={regenerate} className="flex flex-col gap-4">
                {passwordField}
                {errorBox}
                <div>
                  <Button type="submit" variant="primary" loading={pending}>
                    {t("twofactor.regenerate")}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        )}
        {dialog === "disable" && (
          <DialogContent title={t("twofactor.disableTitle")} description={t("twofactor.disableBody")}>
            <form onSubmit={disable} className="flex flex-col gap-4">
              {passwordField}
              {errorBox}
              <div>
                <Button type="submit" variant="danger" loading={pending}>
                  {t("twofactor.disable")}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
