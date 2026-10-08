"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, KeyRound } from "lucide-react";
import { checkSsoProvider, updateSsoProvider } from "@/app/actions";
import { Badge, Button, Disclosure, Field, Input, SwitchRow } from "@/components/ui";
import { GithubIcon } from "@/components/icons/github";
import { GoogleIcon } from "@/components/icons/google";
import { GitlabIcon } from "@/components/icons/gitlab";
import { useT } from "@/components/i18n-provider";
import type { SsoProviderId } from "@/lib/sso";

/** One provider as Settings shows it (never its secret). */
export type SsoRow = {
  id: SsoProviderId;
  enabled: boolean;
  clientId: string;
  hasSecret: boolean;
  issuer: string;
  label: string;
  /** Set by environment variables: shown, not editable. */
  env: boolean;
  /** The redirect URL to register at the provider. */
  callbackUrl: string;
};

const ICON = { google: GoogleIcon, github: GithubIcon, gitlab: GitlabIcon, oidc: KeyRound };

function CopyField({ id, value }: { id: string; value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input id={id} readOnly value={value} className="font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        aria-label={t("settings.ssoCopy")}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function ProviderForm({ row, origin }: { row: SsoRow; origin: string }) {
  const t = useT();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, startSave] = useTransition();
  const [checking, startCheck] = useTransition();
  const locked = row.env;
  const name = row.id === "oidc" ? row.label || t("settings.ssoName.oidc") : t(`settings.ssoName.${row.id}`);

  const save = (fd: FormData) =>
    startSave(async () => {
      const r = await updateSsoProvider(row.id, fd);
      if (r.error) toast.error(r.error);
      else {
        toast.success(t("settings.saved"));
        router.refresh();
      }
    });
  const check = () =>
    startCheck(async () => {
      const r = await checkSsoProvider(row.id, new FormData(formRef.current ?? undefined));
      if (r.error) toast.error(r.error);
      else toast.success(r.detail ?? t("settings.saved"));
    });

  return (
    <Disclosure
      summary={
        <span className="flex flex-1 items-center gap-2">
          {(() => {
            const Icon = ICON[row.id];
            return <Icon className="size-4" />;
          })()}
          <span className="text-foreground">{name}</span>
          <span className="ml-auto">
            {row.env ? (
              <Badge tone="neutral">{t("settings.ssoFromEnv")}</Badge>
            ) : row.enabled ? (
              <Badge tone="success">{t("settings.ssoOn")}</Badge>
            ) : (
              <Badge tone="neutral">{t("settings.ssoOff")}</Badge>
            )}
          </span>
        </span>
      }
    >
      <form
        ref={formRef}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(new FormData(e.currentTarget));
        }}
      >
        <p className="text-[13px] leading-5 text-muted-foreground">{t(`settings.ssoHelp.${row.id}`, { origin })}</p>
        {locked && <p className="text-xs text-muted-foreground">{t("settings.ssoEnvLocked")}</p>}
        <SwitchRow
          id={`sso-${row.id}-enabled`}
          name="enabled"
          label={t("settings.ssoEnabled")}
          description={t("settings.ssoEnabledHint")}
          defaultChecked={row.enabled || row.env}
          disabled={locked}
        />
        <Field label={t("settings.ssoCallback")} hint={t("settings.ssoCallbackHint")} htmlFor={`sso-${row.id}-callback`}>
          <CopyField id={`sso-${row.id}-callback`} value={row.callbackUrl} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("settings.ssoClientId")} htmlFor={`sso-${row.id}-client`}>
            <Input id={`sso-${row.id}-client`} name="clientId" defaultValue={row.clientId} autoComplete="off" spellCheck={false} disabled={locked} />
          </Field>
          <Field label={t("settings.ssoClientSecret")} htmlFor={`sso-${row.id}-secret`}>
            <Input
              id={`sso-${row.id}-secret`}
              name="clientSecret"
              type="password"
              autoComplete="new-password"
              placeholder={row.hasSecret ? t("settings.ssoSecretSaved") : undefined}
              disabled={locked}
            />
          </Field>
        </div>
        {row.id === "gitlab" && (
          <Field label={t("settings.ssoGitlabUrl")} hint={t("settings.ssoGitlabUrlHint")} htmlFor="sso-gitlab-issuer">
            <Input id="sso-gitlab-issuer" name="issuer" defaultValue={row.issuer} placeholder="https://gitlab.com" spellCheck={false} disabled={locked} />
          </Field>
        )}
        {row.id === "oidc" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("settings.ssoIssuer")} hint={t("settings.ssoIssuerHint")} htmlFor="sso-oidc-issuer">
              <Input
                id="sso-oidc-issuer"
                name="issuer"
                defaultValue={row.issuer}
                placeholder="https://auth.example.com/application/o/cbm/"
                spellCheck={false}
                disabled={locked}
              />
            </Field>
            <Field label={t("settings.ssoLabel")} hint={t("settings.ssoLabelHint")} htmlFor="sso-oidc-label">
              <Input id="sso-oidc-label" name="label" defaultValue={row.label} placeholder="Authentik" disabled={locked} />
            </Field>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={check} loading={checking}>
            {t("settings.ssoCheck")}
          </Button>
          {!locked && (
            <Button type="submit" variant="primary" loading={saving}>
              {t("common.save")}
            </Button>
          )}
        </div>
      </form>
    </Disclosure>
  );
}

/** Settings → Single sign-on: one form per provider. */
export function SsoSettings({ rows, origin }: { rows: SsoRow[]; origin: string }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <ProviderForm key={r.id} row={r} origin={origin} />
      ))}
    </div>
  );
}
