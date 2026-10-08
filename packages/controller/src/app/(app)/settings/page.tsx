import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { requireUser, can } from "@/lib/session";
import { getTimezone } from "@/lib/settings";
import { smtpReady, smtpEnvOverrides } from "@/lib/email";
import { formatDateTime } from "@/lib/cn";
import { getT } from "@/lib/i18n";
import { SettingsView } from "./settings-view";
import { SSO_PROVIDERS, ssoCallbackUrl, ssoFromEnv } from "@/lib/sso";
import type { SsoRow } from "@/components/sso-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Settings are all admin-level config (timezone, alert webhook, SMTP secrets).
  const me = await requireUser();
  if (!can(me, "admin")) redirect("/");

  const t = await getT();
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

  // Disaster recovery: destinations eligible for the metadata self-backup
  // ("local" dies with the machine, so it's excluded).
  const drDestinations = await prisma.destination.findMany({
    where: { type: { not: "local" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
  const selfBackup = {
    enabled: setting?.selfBackupEnabled ?? false,
    destinationId: setting?.selfBackupDestinationId ?? drDestinations[0]?.id ?? "",
    lastRunAt: setting?.selfBackupLastRunAt ? formatDateTime(setting.selfBackupLastRunAt, tz) : null,
    lastStatus: setting?.selfBackupLastStatus ?? null,
  };

  // The recovery-file seed only points to the self-backup destination + master
  // key, so it's stale when either changes since the file was last generated.
  // A change is: a different destination, edited destination CREDENTIALS (its
  // row updated after the file was made), or a rotated master key.
  const { masterKeyFingerprint } = await import("@/lib/crypto");
  const currentFp = masterKeyFingerprint();
  const hasFile = !!setting?.recoveryFileGeneration;
  const selfDest = setting?.selfBackupDestinationId
    ? await prisma.destination.findUnique({ where: { id: setting.selfBackupDestinationId }, select: { updatedAt: true } })
    : null;
  const destChanged = hasFile && (setting?.recoveryFileDestId ?? null) !== (setting?.selfBackupDestinationId ?? null);
  const credsChanged =
    hasFile && !destChanged && !!selfDest && !!setting?.recoveryFileAt && selfDest.updatedAt > setting.recoveryFileAt;
  const keyChanged = hasFile && setting?.recoveryFileKeyFp !== currentFp;
  const recoveryFile = {
    generation: setting?.recoveryFileGeneration ?? 0,
    at: setting?.recoveryFileAt ? formatDateTime(setting.recoveryFileAt, tz) : null,
    stale: destChanged || credsChanged || keyChanged,
    staleReason: destChanged
      ? t("settings.staleDestChanged")
      : credsChanged
        ? t("settings.staleCredsChanged")
        : keyChanged
          ? t("settings.staleKeyChanged")
          : null,
    hasSelfBackup: !!(setting?.selfBackupEnabled && setting.selfBackupDestinationId),
  };

  // Machine API tokens for the MCP server / external AI agents.
  const apiTokens = (
    await prisma.apiToken.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, role: true, tokenHint: true, lastUsedAt: true, createdAt: true },
    })
  ).map((tok) => ({
    id: tok.id,
    name: tok.name,
    role: tok.role,
    tokenHint: tok.tokenHint,
    lastUsedAt: tok.lastUsedAt ? formatDateTime(tok.lastUsedAt, tz) : null,
    createdAt: formatDateTime(tok.createdAt, tz),
  }));

  // Two-factor policy, and how many accounts don't use it yet.
  const [usersTotal, usersWithout2fa] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { twoFactorEnabled: false } }),
  ]);
  const twoFactor = {
    policy: (["optional", "admins", "everyone"] as const).find((p) => p === setting?.twoFactorPolicy) ?? "optional",
    total: usersTotal,
    without: usersWithout2fa,
  };

  // Single sign-on: what's saved (never a secret), or what the environment sets.
  const ssoRows = await prisma.ssoProvider.findMany({ omit: { clientSecretEnc: false } }).catch(() => []);
  const sso: SsoRow[] = SSO_PROVIDERS.map((id) => {
    const fromEnv = ssoFromEnv(id);
    const row = ssoRows.find((r) => r.id === id);
    return {
      id,
      enabled: !!fromEnv || !!row?.enabled,
      clientId: fromEnv?.clientId ?? row?.clientId ?? "",
      hasSecret: !!fromEnv || !!row?.clientSecretEnc,
      issuer: fromEnv?.issuer ?? row?.issuer ?? "",
      label: fromEnv?.label ?? row?.label ?? "",
      env: !!fromEnv,
      callbackUrl: ssoCallbackUrl(id),
    };
  });

  return (
    <SettingsView
      sso={sso}
      origin={env.authUrl.replace(/\/+$/, "")}
      twoFactor={twoFactor}
      tz={tz}
      alertWebhookUrl={setting?.alertWebhookUrl ?? ""}
      requireEmailVerification={setting?.requireEmailVerification ?? false}
      ready={ready}
      smtpCurrent={smtpCurrent}
      drDestinations={drDestinations}
      selfBackup={selfBackup}
      recoveryFile={recoveryFile}
      drillsEnabled={setting?.drillsEnabled ?? false}
      apiTokens={apiTokens}
    />
  );
}
