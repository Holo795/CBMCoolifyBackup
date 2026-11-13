"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, Code, Field, Input } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { revealDestinationKeys } from "@/app/actions";

/** Admins: the keys that open a destination's backups without CBM (password, and code with two-factor). */
export function DestinationKeys({ id, twoFactor }: { id: string; twoFactor: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<{ resticPassword?: string; encryptionKey?: string } | null>(null);

  if (keys) {
    const rows = [
      ...(keys.resticPassword ? [[t("destinations.keys.restic"), keys.resticPassword] as const] : []),
      ...(keys.encryptionKey ? [[t("destinations.keys.aes"), keys.encryptionKey] as const] : []),
    ];
    return (
      <div className="flex flex-col gap-3 text-[13px]">
        {rows.length === 0 && <p className="text-muted-foreground">{t("destinations.keys.none")}</p>}
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="font-medium">{label}</span>
            <div className="flex items-center gap-2">
              <Code className="min-w-0 flex-1 break-all">{value}</Code>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("destinations.keys.copy")}
                onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(t("destinations.keys.copied")))}
              >
                <Copy />
              </Button>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{t("destinations.keys.after")}</p>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await revealDestinationKeys(id, fd);
          if (r.error) setError(r.error);
          else setKeys(r.keys ?? {});
        });
      }}
    >
      <p className="text-[13px] text-muted-foreground">{t("destinations.keys.intro")}</p>
      <Field label={t("settings.recoveryFileConfirmPassword")} htmlFor={`keys-pw-${id}`}>
        <Input id={`keys-pw-${id}`} name="password" type="password" autoComplete="current-password" required />
      </Field>
      {twoFactor && (
        <Field label={t("settings.recoveryCode")} htmlFor={`keys-code-${id}`}>
          <Input id={`keys-code-${id}`} name="code" inputMode="numeric" autoComplete="one-time-code" required />
        </Field>
      )}
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          {t("destinations.keys.reveal")}
        </Button>
      </div>
    </form>
  );
}
