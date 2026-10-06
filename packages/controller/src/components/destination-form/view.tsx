"use client";

import { Cloud, FolderOpen, Server, Archive, Layers } from "lucide-react";
import { Checkbox, Disclosure, Field, Input, OptionCards, Textarea } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

export const DESTINATION_FORM_ID = "destination-form";

/** Presentation only: the new-destination form (its submit button lives in the
 * panel footer, linked by DESTINATION_FORM_ID). Logic in ./index.tsx. */
export function DestinationFormView({
  type,
  onTypeChange,
  engine,
  onEngineChange,
  error,
  onSubmit,
}: {
  type: string;
  onTypeChange: (v: string) => void;
  engine: string;
  onEngineChange: (v: string) => void;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useT();
  return (
    <form id={DESTINATION_FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label={t("destinations.form.name")} htmlFor="dest-name">
        <Input id="dest-name" name="name" placeholder="offsite-backups" required autoFocus />
      </Field>

      <Field label={t("destinations.form.type")}>
        <OptionCards
          name="type"
          label={t("destinations.form.type")}
          value={type}
          onChange={onTypeChange}
          options={[
            { value: "local", title: t("destinations.form.typeLocal"), hint: t("destinations.form.typeLocalHint"), icon: <FolderOpen /> },
            { value: "ssh", title: t("destinations.form.typeSsh"), hint: t("destinations.form.typeSshHint"), icon: <Server /> },
            { value: "s3", title: t("destinations.form.typeS3"), hint: t("destinations.form.typeS3Hint"), icon: <Cloud /> },
          ]}
        />
      </Field>

      <Field label={t("destinations.form.engine")} hint={engine === "restic" ? t("destinations.form.resticHint") : undefined}>
        <OptionCards
          name="engine"
          columns={2}
          label={t("destinations.form.engine")}
          value={engine}
          onChange={onEngineChange}
          options={[
            { value: "tar", title: t("destinations.form.engineTarTitle"), hint: t("destinations.form.engineTarHint"), icon: <Archive /> },
            { value: "restic", title: t("destinations.form.engineResticTitle"), hint: t("destinations.form.engineResticHint"), icon: <Layers /> },
          ]}
        />
      </Field>

      {type === "local" && (
        <p className="rounded-lg border bg-surface p-3 text-[13px] leading-5 text-muted-foreground">
          {t("destinations.form.local.p1")} <b className="text-foreground">{t("destinations.form.local.agentHost")}</b>{" "}
          {t("destinations.form.local.p2")} <code className="font-mono text-foreground">/backups</code> {t("destinations.form.local.p3")}{" "}
          <code className="font-mono">ls /backups</code> {t("destinations.form.local.p4")}
        </p>
      )}

      {type === "ssh" && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-subtle-foreground">{t("destinations.form.sectionConnection")}</legend>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <TextField name="host" label={t("destinations.form.ssh.host")} placeholder="backup.example.com" />
            <TextField name="port" label={t("destinations.form.ssh.port")} placeholder="22" defaultValue="22" inputMode="numeric" />
          </div>
          <TextField name="username" label={t("destinations.form.ssh.username")} placeholder="backups" />
          <TextField name="basePath" label={t("destinations.form.ssh.basePath")} placeholder="/srv/backups" />
          <TextField name="password" label={t("destinations.form.ssh.password")} type="password" />
          <Field label={t("destinations.form.ssh.privateKey")} htmlFor="privateKey">
            <Textarea id="privateKey" name="privateKey" rows={3} className="font-mono text-xs" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
          </Field>

          {/* Optional bastion / jump host for targets that aren't reachable directly. */}
          <Disclosure summary={t("destinations.form.ssh.jump.summary")}>
            <div className="flex flex-col gap-4">
              <p className="text-xs leading-5 text-muted-foreground">
                {t("destinations.form.ssh.jump.p1")} <b>{t("destinations.form.ssh.jump.agentHost")}</b> {t("destinations.form.ssh.jump.p2")}
              </p>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <TextField name="jumpHost" label={t("destinations.form.ssh.jump.host")} placeholder="bastion.example.com" />
                <TextField name="jumpPort" label={t("destinations.form.ssh.jump.port")} placeholder="22" defaultValue="22" inputMode="numeric" />
              </div>
              <TextField name="jumpUsername" label={t("destinations.form.ssh.jump.username")} placeholder="backups" />
              <TextField name="jumpPassword" label={t("destinations.form.ssh.jump.password")} type="password" />
              <Field label={t("destinations.form.ssh.jump.privateKey")} htmlFor="jumpPrivateKey">
                <Textarea
                  id="jumpPrivateKey"
                  name="jumpPrivateKey"
                  rows={3}
                  className="font-mono text-xs"
                  placeholder={t("destinations.form.ssh.jump.privateKeyPlaceholder")}
                />
              </Field>
            </div>
          </Disclosure>
        </fieldset>
      )}

      {type === "s3" && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-subtle-foreground">{t("destinations.form.sectionConnection")}</legend>
          <TextField name="bucket" label={t("destinations.form.s3.bucket")} placeholder="coolify-backups" />
          <div className="grid grid-cols-2 gap-3">
            <TextField name="region" label={t("destinations.form.s3.region")} placeholder="us-east-1" defaultValue="us-east-1" />
            <TextField name="prefix" label={t("destinations.form.s3.prefix")} placeholder="cbm" />
          </div>
          <TextField name="endpoint" label={t("destinations.form.s3.endpoint")} placeholder="https://minio.example.com" />
          <TextField name="accessKeyId" label={t("destinations.form.s3.accessKeyId")} autoComplete="off" />
          <TextField name="secretAccessKey" label={t("destinations.form.s3.secretAccessKey")} type="password" autoComplete="new-password" />
          <CheckField name="forcePathStyle" label={t("destinations.form.s3.forcePathStyle")} />
        </fieldset>
      )}

      {engine === "tar" && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-subtle-foreground">{t("destinations.form.sectionOptions")}</legend>
          <CheckField name="encryptionEnabled" label={t("destinations.form.encrypt")} />
        </fieldset>
      )}

      {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
    </form>
  );
}

function TextField({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<"input">) {
  return (
    <Field label={label} htmlFor={`dest-${name}`}>
      <Input id={`dest-${name}`} name={name} {...props} />
    </Field>
  );
}

function CheckField({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
      <Checkbox name={name} /> {label}
    </label>
  );
}
