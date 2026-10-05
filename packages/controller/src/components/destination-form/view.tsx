"use client";

import { Button, Input, Label, Select } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the new-destination form. Logic in ./index.tsx. */
export function DestinationFormView({
  type,
  onTypeChange,
  engine,
  onEngineChange,
  pending,
  error,
  onSubmit,
}: {
  type: string;
  onTypeChange: (v: string) => void;
  engine: string;
  onEngineChange: (v: string) => void;
  pending: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useT();
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("destinations.form.name")}</Label>
        <Input id="name" name="name" placeholder="offsite-backups" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">{t("destinations.form.type")}</Label>
        <Select id="type" name="type" value={type} onChange={(e) => onTypeChange(e.target.value)}>
          <option value="local">{t("destinations.form.typeLocal")}</option>
          <option value="ssh">{t("destinations.form.typeSsh")}</option>
          <option value="s3">{t("destinations.form.typeS3")}</option>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="engine">{t("destinations.form.engine")}</Label>
        <Select id="engine" name="engine" value={engine} onChange={(e) => onEngineChange(e.target.value)}>
          <option value="tar">{t("destinations.form.engineTar")}</option>
          <option value="restic">{t("destinations.form.engineRestic")}</option>
        </Select>
        {engine === "restic" && (
          <p className="text-xs text-muted-foreground">
            {t("destinations.form.resticHint")}
          </p>
        )}
      </div>

      {type === "local" && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">{t("destinations.form.local.p1")} <b className="text-foreground">{t("destinations.form.local.agentHost")}</b> {t("destinations.form.local.p2")} <span className="font-mono text-foreground">/backups</span> {t("destinations.form.local.p3")} <span className="font-mono">ls /backups</span> {t("destinations.form.local.p4")}</div>
      )}

      {type === "ssh" && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field name="host" label={t("destinations.form.ssh.host")} placeholder="backup.example.com" />
            <Field name="port" label={t("destinations.form.ssh.port")} placeholder="22" defaultValue="22" />
          </div>
          <Field name="username" label={t("destinations.form.ssh.username")} placeholder="backups" />
          <Field name="basePath" label={t("destinations.form.ssh.basePath")} placeholder="/srv/backups" />
          <Field name="password" label={t("destinations.form.ssh.password")} type="password" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="privateKey">{t("destinations.form.ssh.privateKey")}</Label>
            <textarea
              id="privateKey"
              name="privateKey"
              rows={3}
              className="rounded-md border bg-transparent px-3 py-2 font-mono text-xs"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            />
          </div>

          {/* Optional bastion / jump host for targets that aren't reachable
              directly (e.g. a private IP behind a gateway). */}
          <details className="rounded-md border bg-muted/20 p-3">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              {t("destinations.form.ssh.jump.summary")}
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">{t("destinations.form.ssh.jump.p1")} <b>{t("destinations.form.ssh.jump.agentHost")}</b> {t("destinations.form.ssh.jump.p2")}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field name="jumpHost" label={t("destinations.form.ssh.jump.host")} placeholder="bastion.example.com" />
                <Field name="jumpPort" label={t("destinations.form.ssh.jump.port")} placeholder="22" defaultValue="22" />
              </div>
              <Field name="jumpUsername" label={t("destinations.form.ssh.jump.username")} placeholder="backups" />
              <Field name="jumpPassword" label={t("destinations.form.ssh.jump.password")} type="password" />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="jumpPrivateKey">{t("destinations.form.ssh.jump.privateKey")}</Label>
                <textarea
                  id="jumpPrivateKey"
                  name="jumpPrivateKey"
                  rows={3}
                  className="rounded-md border bg-transparent px-3 py-2 font-mono text-xs"
                  placeholder={t("destinations.form.ssh.jump.privateKeyPlaceholder")}
                />
              </div>
            </div>
          </details>
        </>
      )}

      {type === "s3" && (
        <>
          <Field name="bucket" label={t("destinations.form.s3.bucket")} placeholder="coolify-backups" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field name="region" label={t("destinations.form.s3.region")} placeholder="us-east-1" defaultValue="us-east-1" />
            <Field name="prefix" label={t("destinations.form.s3.prefix")} placeholder="cbm" />
          </div>
          <Field name="endpoint" label={t("destinations.form.s3.endpoint")} placeholder="https://minio.example.com" />
          <Field name="accessKeyId" label={t("destinations.form.s3.accessKeyId")} />
          <Field name="secretAccessKey" label={t("destinations.form.s3.secretAccessKey")} type="password" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="forcePathStyle" /> {t("destinations.form.s3.forcePathStyle")}
          </label>
        </>
      )}

      {engine === "tar" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="encryptionEnabled" /> {t("destinations.form.encrypt")}
        </label>
      )}

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {pending ? t("destinations.form.working") : t("destinations.form.submit")}
      </Button>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} placeholder={placeholder} type={type} defaultValue={defaultValue} />
    </div>
  );
}
