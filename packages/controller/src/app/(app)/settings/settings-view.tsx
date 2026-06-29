import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { TimezoneForm } from "@/components/timezone-form";
import { AlertWebhookForm } from "@/components/alert-webhook-form";
import { SmtpConfigForm, EmailVerificationToggle, type SmtpCurrent } from "@/components/smtp-config-form";

/** Presentation only: the Settings page markup. Data is fetched in ./page.tsx. */
export function SettingsView({
  tz,
  alertWebhookUrl,
  requireEmailVerification,
  ready,
  smtpCurrent,
}: {
  tz: string;
  alertWebhookUrl: string;
  requireEmailVerification: boolean;
  ready: boolean;
  smtpCurrent: SmtpCurrent;
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
            <p className="text-sm text-muted-foreground">
              Get notified when a backup fails. Paste a Discord or Slack webhook URL (or any endpoint that accepts a
              JSON <code>{`{ content, text }`}</code> body). Leave blank to disable.
            </p>
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
              <div className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
                SMTP isn&apos;t configured or verified yet - <strong>password reset</strong> and{" "}
                <strong>account verification</strong> won&apos;t work until you set it up and a test email succeeds.
              </div>
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
      </div>
    </>
  );
}
