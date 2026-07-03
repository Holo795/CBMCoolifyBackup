import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { TimezoneForm } from "@/components/timezone-form";
import { AlertWebhookForm } from "@/components/alert-webhook-form";
import { SmtpConfigForm, EmailVerificationToggle, type SmtpCurrent } from "@/components/smtp-config-form";
import { SelfBackupForm } from "@/components/self-backup-form";
import { RecoveryFilePanel } from "@/components/recovery-file-panel";
import { CheckCircle2, Circle } from "lucide-react";

/** Presentation only: the Settings page markup. Data is fetched in ./page.tsx. */
export function SettingsView({
  tz,
  alertWebhookUrl,
  requireEmailVerification,
  ready,
  smtpCurrent,
  drDestinations,
  selfBackup,
  recoveryFile,
}: {
  tz: string;
  alertWebhookUrl: string;
  requireEmailVerification: boolean;
  ready: boolean;
  smtpCurrent: SmtpCurrent;
  drDestinations: { id: string; name: string; type: string }[];
  selfBackup: { enabled: boolean; destinationId: string; lastRunAt: string | null; lastStatus: string | null };
  recoveryFile: { generation: number; at: string | null; stale: boolean; staleReason: string | null; hasSelfBackup: boolean };
}) {
  return (
    <>
      <PageHeader title="Settings" description="Application-wide preferences" />
      <div className="flex max-w-xl flex-col gap-6">
        <Card id="timezone" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Timezone</CardTitle>
            <p className="text-sm text-muted-foreground">
              Used to evaluate backup schedules (cron) and to display every timestamp in the UI. Stored on the server, so
              it&apos;s the same for everyone - independent of each browser&apos;s timezone.
            </p>
          </CardHeader>
          <CardContent>
            <TimezoneForm current={tz} />
          </CardContent>
        </Card>

        <Card id="alerts" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Failure alerts</CardTitle>
            <p className="text-sm text-muted-foreground">Get notified when a backup fails. Paste a Discord or Slack webhook URL (or any endpoint that accepts a JSON <code>{`{ content, text }`}</code> body). Leave blank to disable.</p>
          </CardHeader>
          <CardContent>
            <AlertWebhookForm current={alertWebhookUrl} />
          </CardContent>
        </Card>

        <Card id="email" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Email (SMTP)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Used for password reset and (optionally) account verification. Save your SMTP details, then send a test
              email to confirm they work.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!ready && (
              <div className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">SMTP isn&apos;t configured or verified yet - <strong>password reset</strong> and <strong>account verification</strong> won&apos;t work until you set it up and a test email succeeds.</div>
            )}
            {Object.values(smtpCurrent.envLocked).some(Boolean) && (
              <p className="text-xs text-muted-foreground">
                Some fields are set by environment variables and can&apos;t be edited here.
              </p>
            )}
            <SmtpConfigForm current={smtpCurrent} />
            <div className="border-t pt-4">
              <EmailVerificationToggle enabled={requireEmailVerification} />
            </div>
          </CardContent>
        </Card>

        <Card id="disaster-recovery" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Disaster recovery</CardTitle>
            <p className="text-sm text-muted-foreground">CBM keeps an always-current, encrypted copy of its own metadata (instances, destinations, snapshot index, keys) on a destination of your choice, so a dead machine never takes the &quot;brain&quot; with it.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <DrReadiness selfBackupOk={selfBackup.enabled} recoveryFileOk={recoveryFile.generation > 0 && !recoveryFile.stale} />
            <SelfBackupForm destinations={drDestinations} current={selfBackup} />
            <div className="border-t pt-6">
              <RecoveryFilePanel current={recoveryFile} />
            </div>
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
function DrReadiness({ selfBackupOk, recoveryFileOk }: { selfBackupOk: boolean; recoveryFileOk: boolean }) {
  const ready = selfBackupOk && recoveryFileOk;
  return (
    <div className={`rounded-lg border p-3 ${ready ? "" : "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5"}`}>
      <p className="mb-2 text-xs font-medium">{ready ? "Disaster recovery is ready" : "Finish setting up disaster recovery"}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        <DrItem done={selfBackupOk} label="Metadata self-backup enabled" />
        <DrItem done={recoveryFileOk} label="Recovery file downloaded and up to date" />
      </ul>
    </div>
  );
}
