"use client";

import { Checkbox, Disclosure, Field, Input, Textarea } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** What the edit form shows of a destination (lib/destination-edit, no secret). */
export type EditableDestination = Record<string, string | number | boolean | undefined>;

/**
 * The fields of the "edit destination" dialog: name, address and credentials.
 * Where the data is (type, engine, bucket, prefix, base path) is shown, not
 * editable. A secret left empty keeps the stored one.
 */
export function DestinationEditFields({ name, d }: { name: string; d: EditableDestination }) {
  const t = useT();
  const str = (k: string) => (d[k] === undefined ? "" : String(d[k]));
  const keep = t("destinations.edit.keepSecret");
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("destinations.form.name")} htmlFor="edit-name">
        <Input id="edit-name" name="name" defaultValue={name} required />
      </Field>
      {d.type === "ssh" && (
        <>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Text name="host" label={t("destinations.form.ssh.host")} defaultValue={str("host")} />
            <Text name="port" label={t("destinations.form.ssh.port")} defaultValue={str("port")} inputMode="numeric" />
          </div>
          <Text name="username" label={t("destinations.form.ssh.username")} defaultValue={str("username")} />
          <Locked label={t("destinations.form.ssh.basePath")} value={str("basePath")} />
          <Text name="password" label={t("destinations.form.ssh.password")} type="password" placeholder={d.hasPassword ? keep : ""} autoComplete="new-password" />
          {!!d.hasPassword && <Check name="clearPassword" label={t("destinations.edit.clearPassword")} />}
          <Field label={t("destinations.form.ssh.privateKey")} htmlFor="edit-privateKey">
            <Textarea id="edit-privateKey" name="privateKey" rows={3} className="font-mono text-xs" placeholder={d.hasPrivateKey ? keep : "-----BEGIN OPENSSH PRIVATE KEY-----"} />
          </Field>
          {!!d.hasPrivateKey && <Check name="clearPrivateKey" label={t("destinations.edit.clearPrivateKey")} />}
          <Disclosure summary={t("destinations.form.ssh.jump.summary")} defaultOpen={!!d.jumpHost}>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Text name="jumpHost" label={t("destinations.form.ssh.jump.host")} defaultValue={str("jumpHost")} />
                <Text name="jumpPort" label={t("destinations.form.ssh.jump.port")} defaultValue={str("jumpPort") || "22"} inputMode="numeric" />
              </div>
              <Text name="jumpUsername" label={t("destinations.form.ssh.jump.username")} defaultValue={str("jumpUsername")} />
              <Text name="jumpPassword" label={t("destinations.form.ssh.jump.password")} type="password" placeholder={d.hasJumpPassword ? keep : ""} autoComplete="new-password" />
              <Field label={t("destinations.form.ssh.jump.privateKey")} htmlFor="edit-jumpPrivateKey">
                <Textarea id="edit-jumpPrivateKey" name="jumpPrivateKey" rows={3} className="font-mono text-xs" placeholder={d.hasJumpPrivateKey ? keep : ""} />
              </Field>
              <p className="text-xs text-muted-foreground">{t("destinations.edit.jumpEmpty")}</p>
            </div>
          </Disclosure>
        </>
      )}
      {d.type === "s3" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Locked label={t("destinations.form.s3.bucket")} value={str("bucket")} />
            <Locked label={t("destinations.form.s3.prefix")} value={str("prefix")} />
          </div>
          <Text name="region" label={t("destinations.form.s3.region")} defaultValue={str("region")} />
          <Text name="endpoint" label={t("destinations.form.s3.endpoint")} defaultValue={str("endpoint")} />
          <Text name="accessKeyId" label={t("destinations.form.s3.accessKeyId")} defaultValue={str("accessKeyId")} autoComplete="off" />
          <Text name="secretAccessKey" label={t("destinations.form.s3.secretAccessKey")} type="password" placeholder={keep} autoComplete="new-password" />
          <Check name="forcePathStyle" label={t("destinations.form.s3.forcePathStyle")} defaultChecked={!!d.forcePathStyle} />
        </>
      )}
      {d.type === "local" && <Locked label={t("destinations.edit.folder")} value={str("basePath")} />}
      <p className="text-xs leading-5 text-muted-foreground">{t("destinations.edit.note")}</p>
    </div>
  );
}

function Text({ name, label, ...props }: { name: string; label: string } & React.ComponentProps<"input">) {
  return (
    <Field label={label} htmlFor={`edit-${name}`}>
      <Input id={`edit-${name}`} name={name} {...props} />
    </Field>
  );
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <Input value={value || "—"} disabled readOnly />
    </Field>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
      <Checkbox name={name} defaultChecked={defaultChecked} /> {label}
    </label>
  );
}
