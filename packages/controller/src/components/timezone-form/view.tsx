"use client";

import { Button, Select, Field } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the timezone form. Logic in ./index.tsx. */
export function TimezoneFormView({
  tz,
  onTzChange,
  zones,
  now,
  onAction,
  pending,
  dirty,
}: {
  tz: string;
  onTzChange: (v: string) => void;
  zones: string[];
  now: string;
  onAction: (fd: FormData) => void;
  pending: boolean;
  dirty: boolean;
}) {
  const t = useT();
  return (
    <form action={onAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <Field
        label={t("settings.tzLabel")}
        htmlFor="timezone"
        className="min-w-0 flex-1"
        hint={
          <>
            {t("settings.tzCurrentTime")} <span className="tabular text-foreground">{now || "…"}</span>
          </>
        }
      >
        <Select id="timezone" name="timezone" value={tz} onChange={(e) => onTzChange(e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="primary" loading={pending} disabled={!dirty} className="sm:mb-6">
        {t("common.save")}
      </Button>
    </form>
  );
}
