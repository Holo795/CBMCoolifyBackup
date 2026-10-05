"use client";

import { Button, Select, Label } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the timezone form. Logic in ./index.tsx. */
export function TimezoneFormView({
  tz,
  onTzChange,
  zones,
  now,
  onAction,
  pending,
  msg,
}: {
  tz: string;
  onTzChange: (v: string) => void;
  zones: string[];
  now: string;
  onAction: (fd: FormData) => void;
  pending: boolean;
  msg: string | null;
}) {
  const t = useT();
  return (
    <form action={onAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">{t("settings.tzLabel")}</Label>
        <Select id="timezone" name="timezone" value={tz} onChange={(e) => onTzChange(e.target.value)} className="max-w-xs">
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("settings.tzCurrentTime")} <span className="tabular-nums text-foreground">{now || "…"}</span>
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
