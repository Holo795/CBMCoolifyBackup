import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Code } from "@/components/ui";
import { TimezoneForm } from "@/components/timezone-form";
import { AlertWebhookForm } from "@/components/alert-webhook-form";
import { SmtpConfigForm, EmailVerificationToggle, type SmtpCurrent } from "@/components/smtp-config-form";
import { SelfBackupForm } from "@/components/self-backup-form";
import { RecoveryFilePanel } from "@/components/recovery-file-panel";
import { ApiTokens, CreateApiTokenButton, type ApiTokenRow } from "@/components/api-tokens";
import { DrillsToggle } from "@/components/drills-toggle";
import { SectionNav } from "@/components/section-nav";
import { TwoFactorPolicyForm } from "@/components/two-factor-policy";
import { SsoSettings, type SsoRow } from "@/components/sso-settings";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { getT, type T } from "@/lib/i18n";

/** Presentation only: the Settings page markup. Data is fetched in ./page.tsx. */
export async function SettingsView({
  tz,
  alertWebhookUrl,
  requireEmailVerification,
  ready,
  smtpCurrent,
  drDestinations,
  selfBackup,
  recoveryFile,
  drillsEnabled,
  apiTokens,
  twoFactor,
  sso,
  origin,
}: {
  tz: string;
  alertWebhookUrl: string;
  requireEmailVerification: boolean;
  ready: boolean;
  smtpCurrent: SmtpCurrent;
  drDestinations: { id: string; name: string; type: string }[];
  selfBackup: { enabled: boolean; destinationId: string; lastRunAt: string | null; lastStatus: string | null };
  recoveryFile: { generation: number; at: string | null; stale: boolean; staleReason: string | null; hasSelfBackup: boolean };
  drillsEnabled: boolean;
  apiTokens: ApiTokenRow[];
  twoFactor: { policy: "optional" | "admins" | "everyone"; total: number; without: number };
  sso: SsoRow[];
  /** The controller's public URL (BETTER_AUTH_URL). */
  origin: string;
}) {
  const t = await getT();
  const sections = [
    { id: "timezone", label: t("settings.timezoneTitle") },
    { id: "alerts", label: t("settings.alertsTitle") },
    { id: "email", label: t("settings.emailTitle") },
    { id: "disaster-recovery", label: t("settings.drTitle") },
    { id: "restore-drills", label: t("settings.drillsTitle") },
    { id: "two-factor", label: t("twofactor.policyTitle") },
    { id: "sso", label: t("settings.ssoTitle") },
    { id: "api-tokens", label: t("settings.apiTokensTitle") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <div>
          <SectionNav items={sections} label={t("settings.title")} />
        </div>
        <div className="flex max-w-3xl min-w-0 flex-col gap-6">
          <Card id="timezone" className="scroll-mt-8">
            <CardHeader>
              <CardTitle>{t("settings.timezoneTitle")}</CardTitle>
              <CardDescription>{t("settings.timezoneDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <TimezoneForm current={tz} />
            </CardContent>
          </Card>

          <Card id="alerts" className="scroll-mt-8">
            <CardHeader>
              <CardTitle>{t("settings.alertsTitle")}</CardTitle>
              <CardDescription>
                {t("settings.alertsDescBefore")}
                <Code>{`{ content, text }`}</Code>
                {t("settings.alertsDescAfter")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertWebhookForm current={alertWebhookUrl} />
            </CardContent>
          </Card>

          <Card id="email" className="scroll-mt-8">
            <CardHeader>
              <CardTitle>{t("settings.emailTitle")}</CardTitle>
              <CardDescription>{t("settings.emailDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {!ready && (
                <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    {t("settings.emailNotReadyPre")}
                    <strong>{t("settings.emailNotReadyPasswordReset")}</strong>
                    {t("settings.emailNotReadyMid")}
                    <strong>{t("settings.emailNotReadyVerification")}</strong>
                    {t("settings.emailNotReadyPost")}
                  </span>
                </div>
              )}
              {Object.values(smtpCurrent.envLocked).some(Boolean) && (
                <p className="text-xs text-muted-foreground">{t("settings.emailEnvLocked")}</p>
              )}
              <SmtpConfigForm current={smtpCurrent} />
              <div className="border-t pt-5">
                <EmailVerificationToggle enabled={requireEmailVerification} />
              </div>
            </CardContent>
          </Card>

          <Card id="disaster-recovery" className="scroll-mt-8">
            <CardHeader>
              <CardTitle>{t("settings.drTitle")}</CardTitle>
              <CardDescription>{t("settings.drDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <DrReadiness t={t} selfBackupOk={selfBackup.enabled} recoveryFileOk={recoveryFile.generation > 0 && !recoveryFile.stale} />
              <SelfBackupForm destinations={drDestinations} current={selfBackup} />
              <div className="border-t pt-6">
                <RecoveryFilePanel current={recoveryFile} />
              </div>
            </CardContent>
          </Card>

          <Card id="restore-drills" className="scroll-mt-8">
            <CardHeader>
              <CardTitle>{t("settings.drillsTitle")}</CardTitle>
              <CardDescription>{t("settings.drillsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <DrillsToggle enabled={drillsEnabled} />
            </CardContent>
          </Card>

          <Card id="two-factor" className="scroll-mt-8">
            <CardHeader>
              <CardTitle>{t("twofactor.policyTitle")}</CardTitle>
              <CardDescription>{t("twofactor.policyDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <TwoFactorPolicyForm {...twoFactor} />
            </CardContent>
          </Card>

          <Card id="sso" className="scroll-mt-8">
            <CardHeader>
              <CardTitle>{t("settings.ssoTitle")}</CardTitle>
              <CardDescription>{t("settings.ssoDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <SsoSettings rows={sso} origin={origin} />
            </CardContent>
          </Card>

          <Card id="api-tokens" className="scroll-mt-8">
            <CardHeader actions={<CreateApiTokenButton />}>
              <CardTitle>{t("settings.apiTokensTitle")}</CardTitle>
              <CardDescription>{t("settings.apiTokensDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ApiTokens tokens={apiTokens} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** One line of the DR readiness checklist. */
function DrItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-subtle-foreground" />}
      <span className={done ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

/** Two-step DR readiness at a glance. Green only when you can actually recover. */
function DrReadiness({ t, selfBackupOk, recoveryFileOk }: { t: T; selfBackupOk: boolean; recoveryFileOk: boolean }) {
  const ready = selfBackupOk && recoveryFileOk;
  return (
    <div className={`rounded-lg border px-4 py-3 ${ready ? "border-success/30 bg-success-soft" : "border-warning/30 bg-warning-soft"}`}>
      <p className={`mb-2 text-[13px] font-medium ${ready ? "text-success" : "text-warning"}`}>
        {ready ? t("settings.drReady") : t("settings.drFinishSetup")}
      </p>
      <ul className="flex flex-col gap-1.5 text-[13px]">
        <DrItem done={selfBackupOk} label={t("settings.drItemSelfBackup")} />
        <DrItem done={recoveryFileOk} label={t("settings.drItemRecoveryFile")} />
      </ul>
    </div>
  );
}
