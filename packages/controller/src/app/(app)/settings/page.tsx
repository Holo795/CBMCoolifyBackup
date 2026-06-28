import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getTimezone } from "@/lib/settings";
import { smtpReady, smtpEnvOverrides } from "@/lib/email";
import { TimezoneForm } from "@/components/timezone-form";
import { AlertWebhookForm } from "@/components/alert-webhook-form";
import { SmtpConfigForm, EmailVerificationToggle } from "@/components/smtp-config-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tz = await getTimezone();
  const setting = await prisma.setting.findUnique({ where: { id: "global" } }).catch(() => null);
  const ready = await smtpReady();
  const envLocked = smtpEnvOverrides();
  const smtpCurrent = {
    host: env.smtp.host || setting?.smtpHost || "",
    port: env.smtp.port || (setting?.smtpPort != null ? String(setting.smtpPort) : ""),
    secure: env.smtp.secure ? env.smtp.secure === "true" : (setting?.smtpSecure ?? false),
    user: env.smtp.user || setting?.smtpUser || "",
    from: env.smtp.from || setting?.smtpFrom || "",
    fromName: env.smtp.fromName || setting?.smtpFromName || "",
    hasPassword: !!(env.smtp.password || setting?.smtpPasswordEnc),
    envLocked,
  };

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
            <AlertWebhookForm current={setting?.alertWebhookUrl ?? ""} />
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
            {Object.values(envLocked).some(Boolean) && (
              <p className="text-xs text-muted-foreground">
                Some fields are set by environment variables and can&apos;t be edited here.
              </p>
            )}
            <SmtpConfigForm current={smtpCurrent} />
            <div className="border-t pt-4">
              <EmailVerificationToggle enabled={setting?.requireEmailVerification ?? false} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
