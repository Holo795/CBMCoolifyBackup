import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { requireUser, can } from "@/lib/session";
import { getTimezone } from "@/lib/settings";
import { smtpReady, smtpEnvOverrides } from "@/lib/email";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Settings are all admin-level config (timezone, alert webhook, SMTP secrets).
  const me = await requireUser();
  if (!can(me, "admin")) redirect("/");

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
    <SettingsView
      tz={tz}
      alertWebhookUrl={setting?.alertWebhookUrl ?? ""}
      requireEmailVerification={setting?.requireEmailVerification ?? false}
      ready={ready}
      smtpCurrent={smtpCurrent}
    />
  );
}
