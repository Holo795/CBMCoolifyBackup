import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { TimezoneForm } from "@/components/timezone-form";
import { AlertWebhookForm } from "@/components/alert-webhook-form";
import { SmtpConfigForm, EmailVerificationToggle, type SmtpCurrent } from "@/components/smtp-config-form";
import { SelfBackupForm } from "@/components/self-backup-form";
import { RecoveryFilePanel } from "@/components/recovery-file-panel";
import { ApiTokens } from "@/components/api-tokens";
import { type ApiTokenRow } from "@/components/api-tokens/view";
import { CheckCircle2, Circle } from "lucide-react";
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
  apiTokens,
}: {
  tz: string;
  alertWebhookUrl: string;
  requireEmailVerification: boolean;
  ready: boolean;
  smtpCurrent: SmtpCurrent;
  drDestinations: { id: string; name: string; type: string }[];
  selfBackup: { enabled: boolean; destinationId: string; lastRunAt: string | null; lastStatus: string | null };
  recoveryFile: { generation: number; at: string | null; stale: boolean; staleReason: string | null; hasSelfBackup: boolean };
  apiTokens: ApiTokenRow[];
}) {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="flex max-w-xl flex-col gap-6">
        <Card id="timezone" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("settings.timezoneTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("settings.timezoneDesc")}</p>
          </CardHeader>
          <CardContent>
            <TimezoneForm current={tz} />
          </CardContent>
        </Card>

        <Card id="alerts" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("settings.alertsTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("settings.alertsDescBefore")}<code>{`{ content, text }`}</code>{t("settings.alertsDescAfter")}</p>
          </CardHeader>
          <CardContent>
            <AlertWebhookForm current={alertWebhookUrl} />
          </CardContent>
        </Card>

        <Card id="email" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("settings.emailTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("settings.emailDesc")}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!ready && (
              <div className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">{t("settings.emailNotReadyPre")}<strong>{t("settings.emailNotReadyPasswordReset")}</strong>{t("settings.emailNotReadyMid")}<strong>{t("settings.emailNotReadyVerification")}</strong>{t("settings.emailNotReadyPost")}</div>
            )}
            {Object.values(smtpCurrent.envLocked).some(Boolean) && (
              <p className="text-xs text-muted-foreground">{t("settings.emailEnvLocked")}</p>
            )}
            <SmtpConfigForm current={smtpCurrent} />
            <div className="border-t pt-4">
              <EmailVerificationToggle enabled={requireEmailVerification} />
            </div>
          </CardContent>
        </Card>

        <Card id="disaster-recovery" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("settings.drTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("settings.drDesc")}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <DrReadiness t={t} selfBackupOk={selfBackup.enabled} recoveryFileOk={recoveryFile.generation > 0 && !recoveryFile.stale} />
            <SelfBackupForm destinations={drDestinations} current={selfBackup} />
            <div className="border-t pt-6">
              <RecoveryFilePanel current={recoveryFile} />
            </div>
          </CardContent>
        </Card>

        <Card id="api-tokens" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("settings.apiTokensTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("settings.apiTokensDesc")}</p>
          </CardHeader>
          <CardContent>
            <ApiTokens tokens={apiTokens} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** One line of the DR readiness checklist. */
function DrItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={done ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

/** Two-step DR readiness at a glance. Green only when you can actually recover. */
function DrReadiness({ t, selfBackupOk, recoveryFileOk }: { t: T; selfBackupOk: boolean; recoveryFileOk: boolean }) {
  const ready = selfBackupOk && recoveryFileOk;
  return (
    <div className={`rounded-lg border p-3 ${ready ? "" : "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5"}`}>
      <p className="mb-2 text-xs font-medium">{ready ? t("settings.drReady") : t("settings.drFinishSetup")}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        <DrItem done={selfBackupOk} label={t("settings.drItemSelfBackup")} />
        <DrItem done={recoveryFileOk} label={t("settings.drItemRecoveryFile")} />
      </ul>
    </div>
  );
}
