"use client";

import { Send } from "lucide-react";
import { Button, Input, Field, SwitchRow } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

export interface SmtpCurrent {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  from: string;
  fromName: string;
  hasPassword: boolean;
  envLocked: { host: boolean; port: boolean; secure: boolean; user: boolean; password: boolean; from: boolean; fromName: boolean };
}

/** Presentation only: the SMTP form. Logic in ./index.tsx. */
export function SmtpConfigFormView({
  current,
  pending,
  testing,
  onAction,
  onTest,
}: {
  current: SmtpCurrent;
  pending: boolean;
  testing: boolean;
  onAction: (fd: FormData) => void;
  onTest: () => void;
}) {
  const t = useT();
  const env = current.envLocked;

  return (
    <form action={onAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <Field label={t("settings.smtpHost")} htmlFor="smtpHost">
          <Input id="smtpHost" name="smtpHost" defaultValue={current.host} disabled={env.host} placeholder="smtp.example.com" />
        </Field>
        <Field label={t("settings.smtpPort")} htmlFor="smtpPort">
          <Input id="smtpPort" name="smtpPort" type="number" defaultValue={current.port} disabled={env.port} placeholder="587" />
        </Field>
      </div>

      <SwitchRow id="smtpSecure" name="smtpSecure" label={t("settings.smtpImplicitTls")} defaultChecked={current.secure} disabled={env.secure} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("settings.smtpUsername")} htmlFor="smtpUser">
          <Input id="smtpUser" name="smtpUser" defaultValue={current.user} disabled={env.user} autoComplete="off" />
        </Field>
        <Field label={t("settings.smtpPassword")} htmlFor="smtpPassword">
          <Input
            id="smtpPassword"
            name="smtpPassword"
            type="password"
            disabled={env.password}
            autoComplete="new-password"
            placeholder={env.password ? t("settings.smtpPasswordEnvPlaceholder") : current.hasPassword ? t("settings.smtpPasswordUnchanged") : ""}
          />
        </Field>
        <Field label={t("settings.smtpFrom")} htmlFor="smtpFrom">
          <Input id="smtpFrom" name="smtpFrom" type="email" defaultValue={current.from} disabled={env.from} placeholder="cbm@yourdomain.com" />
        </Field>
        <Field label={t("settings.smtpFromName")} htmlFor="smtpFromName">
          <Input id="smtpFromName" name="smtpFromName" defaultValue={current.fromName} disabled={env.fromName} placeholder="CBM Backups" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" loading={testing} disabled={pending} onClick={onTest}>
          <Send /> {t("settings.smtpSendTest")}
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

/** Presentation only: the verification toggle. Logic in ./index.tsx. */
export function EmailVerificationToggleView({
  on,
  pending,
  onChange,
}: {
  on: boolean;
  pending: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useT();
  return (
    <SwitchRow
      id="requireEmailVerification"
      label={t("settings.requireEmailVerification")}
      description={t("settings.requireEmailVerificationDesc")}
      checked={on}
      onCheckedChange={onChange}
      disabled={pending}
    />
  );
}
