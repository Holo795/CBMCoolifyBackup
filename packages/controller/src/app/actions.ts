"use server";

import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n-shared";
import { getT } from "@/lib/i18n";
import { errorText } from "@/lib/user-error";
import { authErrorText, type AuthErrorLike } from "@/lib/auth-errors";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureControlPlaneResource } from "@/lib/control-plane";
import { env } from "@/lib/env";
import { auth } from "@/lib/auth";
import { requireUser, requireRole } from "@/lib/session";
import { isRole, inviteExpiry } from "@/lib/invitations";
import { encryptSecret, decryptSecret, generateAesKeyB64, randomToken, sha256Hex } from "@/lib/crypto";
import { CoolifyClient } from "@/lib/coolify";
import { syncInstance } from "@/lib/discovery";
import { enqueueBackup, enqueueRestore, enqueuePrune, enqueueVerifyDestination, enqueueDrill, resolveDestination, groupSnapshotsForPrune } from "@/lib/jobs";
import { freqToCron } from "@/lib/schedule";
import { isValidCron } from "@/lib/cron";
import { setTimezone, isValidTimezone } from "@/lib/settings";
import { removeSnapshots } from "@/lib/snapshot-removal";
import { resetTwoFactor, isTwoFactorPolicy } from "@/lib/two-factor";
import { settingsFromForm } from "@/lib/agent-settings";

function s(fd: FormData, key: string): string {
  return (fd.get(key) ?? "").toString().trim();
}

/** A Better Auth APIError carries { code, message } in its body. */
function authError(e: unknown): AuthErrorLike {
  return (e as { body?: AuthErrorLike }).body ?? { message: (e as Error).message };
}

/** Set the UI language (cookie). Public: usable from the sign-in page too. */
export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { ok: true };
}

/* ----------------------------- settings ----------------------------- */

/** Set the app-wide IANA timezone used for schedules + timestamp display. */
export async function updateTimezone(fd: FormData) {
  await requireRole("admin");
  const t = await getT();
  const tz = s(fd, "timezone");
  if (!tz || !isValidTimezone(tz)) return { error: t("messages.invalidTimezone") };
  await setTimezone(tz);
  // Schedules + every page that shows times depend on this.
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Set (or clear) the webhook notified when a backup fails. */
export async function updateAlertWebhook(fd: FormData) {
  await requireRole("admin");
  const url = s(fd, "alertWebhookUrl");
  if (url && !/^https?:\/\//i.test(url)) return { error: (await getT())("messages.webhookUrlInvalid") };
  await prisma.setting.upsert({
    where: { id: "global" },
    create: { id: "global", alertWebhookUrl: url || null },
    update: { alertWebhookUrl: url || null },
  });
  revalidatePath("/settings");
  return { ok: true };
}

/** Send a test message to a webhook URL (without saving it). */
export async function testAlertWebhook(url: string) {
  await requireRole("admin");
  const t = await getT();
  if (!url || !/^https?:\/\//i.test(url)) return { error: t("messages.webhookUrlFirst") };
  const { sendTestAlert } = await import("@/lib/notify");
  const ok = await sendTestAlert(url);
  return ok ? { ok: true, detail: t("messages.testNotificationSent") } : { error: t("messages.webhookRejected") };
}

/* ----------------------------- profile ----------------------------- */

/** Change the signed-in user's own password (revokes other sessions). */
export async function changePassword(fd: FormData) {
  await requireUser();
  const t = await getT();
  const currentPassword = s(fd, "currentPassword");
  const newPassword = s(fd, "newPassword");
  const confirm = s(fd, "confirmPassword");
  if (!currentPassword || !newPassword) return { error: t("messages.passwordFieldsRequired") };
  if (newPassword.length < 8) return { error: t("messages.newPasswordTooShort") };
  if (newPassword !== confirm) return { error: t("messages.newPasswordMismatch") };
  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (e) {
    return { error: authErrorText(authError(e), t, "messages.changePasswordFailed") };
  }
  return { ok: true };
}

/** Change the signed-in user's own email. With verification off this takes
 *  effect immediately; with it on, Better Auth emails a confirmation link. */
export async function changeEmail(fd: FormData) {
  const user = await requireUser();
  const t = await getT();
  const newEmail = s(fd, "newEmail").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) return { error: t("messages.invalidEmail") };
  if (newEmail === user.email.toLowerCase()) return { ok: true };

  const setting = await prisma.setting.findUnique({ where: { id: "global" } }).catch(() => null);
  if (setting?.requireEmailVerification) {
    // Verification on: Better Auth sends a confirmation link to the current
    // address; the change applies only once it's clicked.
    try {
      await auth.api.changeEmail({ body: { newEmail }, headers: await headers() });
    } catch (e) {
      return { error: authErrorText(authError(e), t, "messages.changeEmailFailed") };
    }
    return { ok: true, detail: t("messages.checkInbox") };
  }

  // Verification off: apply directly (Better Auth's changeEmail would otherwise
  // wait for a confirmation email we don't send).
  try {
    await prisma.user.update({ where: { id: user.id }, data: { email: newEmail, emailVerified: false } });
  } catch {
    return { error: t("messages.emailInUse") };
  }
  // The topbar shows the email, so refresh every page.
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Update the signed-in user's first/last name (and the derived display name). */
export async function updateProfileName(fd: FormData) {
  await requireUser();
  const t = await getT();
  const firstName = s(fd, "firstName");
  const lastName = s(fd, "lastName");
  if (!firstName && !lastName) return { error: t("messages.nameRequired") };
  const name = `${firstName} ${lastName}`.trim();
  try {
    await auth.api.updateUser({ body: { name, firstName, lastName }, headers: await headers() });
  } catch (e) {
    return { error: authErrorText(authError(e), t, "messages.updateNameFailed") };
  }
  // The topbar shows the name, so refresh every page.
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ----------------------------- email / SMTP ----------------------------- */

/** Save the SMTP settings (user/password encrypted; blank password keeps the
 *  existing one). Any change resets the "verified" flag. */
export async function updateSmtp(fd: FormData) {
  await requireRole("admin");
  const host = s(fd, "smtpHost");
  const port = Number(s(fd, "smtpPort")) || null;
  const secure = fd.get("smtpSecure") === "on";
  const user = s(fd, "smtpUser");
  const password = s(fd, "smtpPassword"); // blank = keep existing
  const from = s(fd, "smtpFrom");
  const fromName = s(fd, "smtpFromName");
  if (from && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) return { error: (await getT())("messages.fromInvalid") };
  await prisma.setting.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      smtpHost: host || null,
      smtpPort: port,
      smtpSecure: secure,
      smtpUser: user || null,
      smtpPasswordEnc: password ? encryptSecret(password) : null,
      smtpFrom: from || null,
      smtpFromName: fromName || null,
      smtpLastVerifiedOk: false,
    },
    update: {
      smtpHost: host || null,
      smtpPort: port,
      smtpSecure: secure,
      smtpUser: user || null,
      ...(password ? { smtpPasswordEnc: encryptSecret(password) } : {}),
      smtpFrom: from || null,
      smtpFromName: fromName || null,
      smtpLastVerifiedOk: false,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/login");
  return { ok: true };
}

/** Verify the saved SMTP config and send a test email to the admin who asked
 * (the From address is often an unread no-reply); flips the "verified" flag. */
export async function testSmtp() {
  const user = await requireRole("admin");
  const t = await getT();
  const { effectiveSmtp, verifySmtp, sendMail } = await import("@/lib/email");
  const cfg = await effectiveSmtp();
  if (!cfg) return { error: t("messages.smtpNotConfigured") };
  const v = await verifySmtp(cfg);
  if (!v.ok) return { error: t("messages.smtpConnectFailed", { error: v.error ?? "" }) };
  try {
    await sendMail({ to: user.email, subject: "CBM SMTP test", text: "✅ Your CBM SMTP settings are working." });
  } catch (e) {
    return { error: t("messages.smtpSendFailed", { error: (e as Error).message }) };
  }
  await prisma.setting.update({ where: { id: "global" }, data: { smtpLastVerifiedOk: true } });
  revalidatePath("/settings");
  revalidatePath("/login");
  return { ok: true, detail: t("messages.testEmailSent", { to: user.email }) };
}

/** Toggle soft account-email verification. Enabling requires a working SMTP. */
export async function setEmailVerification(enabled: boolean) {
  await requireRole("admin");
  if (enabled) {
    const t = await getT();
    const { effectiveSmtp, verifySmtp } = await import("@/lib/email");
    const cfg = await effectiveSmtp();
    if (!cfg) return { error: t("messages.smtpRequiredForVerification") };
    const v = await verifySmtp(cfg);
    if (!v.ok) return { error: t("messages.smtpNotWorking", { error: v.error ?? "" }) };
    await prisma.setting.update({
      where: { id: "global" },
      data: { requireEmailVerification: true, smtpLastVerifiedOk: true },
    });
  } else {
    await prisma.setting.update({ where: { id: "global" }, data: { requireEmailVerification: false } });
  }
  revalidatePath("/settings");
  return { ok: true };
}

/* ----------------------- disaster recovery: self-backup ----------------------- */

/** Configure the always-current self-backup of the controller's metadata DB.
 * A "local" destination dies with the machine, so it's refused. */
export async function updateSelfBackup(fd: FormData) {
  await requireRole("admin");
  const t = await getT();
  const enabled = fd.get("enabled") === "on";
  const destinationId = s(fd, "destinationId");
  if (enabled) {
    if (!destinationId) return { error: t("messages.pickDestinationFirst") };
    const dest = await prisma.destination.findUnique({ where: { id: destinationId } });
    if (!dest) return { error: t("messages.destinationNotFound") };
    if (dest.type === "local") return { error: t("messages.localDiesWithMachine") };
  }
  await prisma.setting.upsert({
    where: { id: "global" },
    create: { id: "global", selfBackupEnabled: enabled, selfBackupDestinationId: destinationId || null },
    update: { selfBackupEnabled: enabled, selfBackupDestinationId: destinationId || null },
  });
  revalidatePath("/settings");
  return { ok: true, detail: t(enabled ? "messages.selfBackupEnabled" : "messages.selfBackupDisabled") };
}

/** Run the metadata self-backup immediately (also verifies the setup works). */
export async function runSelfBackupNow() {
  await requireRole("admin");
  const { runSelfBackup } = await import("@/lib/self-backup");
  const r = await runSelfBackup();
  revalidatePath("/settings");
  const t = await getT();
  return r.ok ? { ok: true, detail: t("messages.metadataBackedUp") } : { error: errorText(r.error, t) };
}

/** Drill: prove the recovery path (download + decrypt the latest self-backup)
 * without a destructive restore. */
export async function verifyRecoveryPath() {
  await requireRole("admin");
  const { verifyLatestSelfBackup } = await import("@/lib/self-backup");
  const r = await verifyLatestSelfBackup();
  const t = await getT();
  return r.ok ? { ok: true, detail: r.detail && errorText(r.detail, t) } : { error: errorText(r.error, t) };
}

/* ----------------------------- instances ----------------------------- */

export async function connectInstance(fd: FormData) {
  await requireRole("admin");
  const name = s(fd, "name");
  const baseUrl = s(fd, "baseUrl").replace(/\/$/, "");
  const token = s(fd, "apiToken");
  const t = await getT();
  if (!name || !baseUrl || !token) return { error: t("messages.allFieldsRequired") };

  const ping = await new CoolifyClient(baseUrl, token).ping();
  if (!ping.ok) return { error: t("messages.cannotReachCoolify", { error: ping.error ?? "" }) };

  const instance = await prisma.coolifyInstance.create({
    data: { name, baseUrl, apiTokenEnc: encryptSecret(token) },
  });

  let warning: string | undefined;
  try {
    await syncInstance(instance.id);
  } catch (e) {
    warning = t("messages.connectedSyncFailed", { error: (e as Error).message });
  }

  revalidatePath("/instances");
  revalidatePath("/resources");
  revalidatePath("/agents");
  return warning ? { ok: true, warning } : { ok: true };
}

/**
 * Generate a fresh per-instance enrollment token and return the install
 * command containing it. The plaintext is shown to the operator exactly once:
 * only its sha256 hash + a masked hint are stored, so it can never be
 * re-displayed. Revealing again rotates the token, invalidating the previous
 * one (the agent on that host must then be reconfigured with the new command).
 */
export async function revealInstallCommand(
  instanceId: string,
): Promise<{ oneLiner: string; raw: string; hint: string }> {
  await requireRole("admin");
  const token = "cbm_" + randomToken(24);
  const hint = `${token.slice(0, 8)}…${token.slice(-4)}`;
  await prisma.coolifyInstance.update({
    where: { id: instanceId },
    data: { enrollTokenHash: sha256Hex(token), enrollTokenHint: hint, enrollTokenSetAt: new Date() },
  });

  const base = (env.agentControllerUrl || env.authUrl).replace(/\/$/, "");
  const image = `${env.agentImage}:${env.agentImageTag}`;
  const oneLiner = `curl -fsSL ${base}/install.sh | CBM_TOKEN=${token} sh`;
  const raw = [
    "docker stop -t 30 cbm-agent 2>/dev/null; docker rm -f cbm-agent 2>/dev/null",
    "docker run -d --name cbm-agent --restart unless-stopped \\",
    "  -v /var/run/docker.sock:/var/run/docker.sock \\",
    "  -v /backups:/backups \\",
    // Work dir on a named volume: staging stays off the container layer, and the
    // pending results / paused-container state survive a reinstall.
    "  -v cbm-agent-work:/var/lib/cbm-agent \\",
    `  -e CONTROLLER_URL=${base} \\`,
    `  -e ENROLLMENT_TOKEN=${token} \\`,
    '  -e AGENT_HOSTNAME="$(hostname)" \\',
    `  ${image}`,
  ].join("\n");

  revalidatePath("/instances");
  return { oneLiner, raw, hint };
}

/** Back up the Coolify control plane itself (its Postgres + /data/coolify). */
export async function backupCoolifyInstance(instanceId: string) {
  await requireRole("operator");
  const resource = await ensureControlPlaneResource(instanceId);
  const t = await getT();
  try {
    await enqueueBackup(resource.id);
  } catch (e) {
    return { error: errorText(e, t) };
  }
  revalidatePath("/instances");
  revalidatePath("/snapshots");
  return { ok: true, detail: t("messages.coolifyBackupQueued") };
}

export async function syncInstanceAction(instanceId: string): Promise<void> {
  await requireRole("admin");
  try {
    await syncInstance(instanceId);
  } catch (e) {
    console.error("[sync] failed", (e as Error).message);
  }
  revalidatePath("/resources");
  revalidatePath("/instances");
}

export async function deleteInstance(instanceId: string) {
  await requireRole("admin");
  await prisma.coolifyInstance.delete({ where: { id: instanceId } });
  revalidatePath("/instances");
  revalidatePath("/resources");
}

/**
 * Re-point an instance at a different Coolify (disaster recovery: the old panel
 * is gone, redirect the SAME record so every resource/snapshot/schedule keeps
 * following it). Leave the token blank to keep the stored one (URL-only moves).
 */
export async function repointInstance(instanceId: string, fd: FormData) {
  await requireRole("admin");
  const baseUrl = s(fd, "baseUrl").replace(/\/$/, "");
  const token = s(fd, "apiToken");
  const t = await getT();
  if (!baseUrl) return { error: t("messages.baseUrlRequired") };
  const inst = await prisma.coolifyInstance.findUnique({ where: { id: instanceId } });
  if (!inst) return { error: t("messages.instanceNotFound") };

  const ping = await new CoolifyClient(baseUrl, token || decryptSecret(inst.apiTokenEnc)).ping();
  if (!ping.ok) return { error: t("messages.cannotReachCoolifyAt", { url: baseUrl, error: ping.error ?? "" }) };

  await prisma.coolifyInstance.update({
    where: { id: instanceId },
    data: { baseUrl, ...(token ? { apiTokenEnc: encryptSecret(token) } : {}) },
  });
  let warning: string | undefined;
  try {
    await syncInstance(instanceId);
  } catch (e) {
    warning = t("messages.repointedSyncFailed", { error: (e as Error).message });
  }
  revalidatePath("/instances");
  revalidatePath("/resources");
  revalidatePath("/agents");
  return warning ? { ok: true, warning } : { ok: true, detail: t("messages.repointed", { url: baseUrl }) };
}

/**
 * Save the restore-time server remap for a multi-server TARGET instance:
 * { <source server uuid>: <this instance's server uuid> }. Empty map clears it.
 */
export async function updateInstanceServerMap(
  instanceId: string,
  map: Record<string, string>,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("admin");
  const clean = Object.fromEntries(
    Object.entries(map ?? {})
      .map(([k, v]) => [k.trim(), v.trim()])
      .filter(([k, v]) => k && v),
  );
  await prisma.coolifyInstance.update({
    where: { id: instanceId },
    data: { serverUuidMap: Object.keys(clean).length ? clean : Prisma.DbNull },
  });
  revalidatePath("/instances");
  return { ok: true };
}

/* ----------------------------- agents ----------------------------- */

export async function linkAgent(agentId: string, instanceId: string) {
  await requireRole("admin");
  await prisma.agent.update({
    where: { id: agentId },
    data: { instanceId: instanceId || null },
  });
  revalidatePath("/agents");
}

export async function deleteAgent(agentId: string) {
  await requireRole("admin");
  await prisma.agent.delete({ where: { id: agentId } });
  revalidatePath("/agents");
}

/**
 * Agent settings for every agent (concurrency, space kept free, copy mode, log
 * level). Empty fields fall back to the built-in defaults. Agents pick the
 * change up with their next heartbeat (about 30 s); a value their host fixes
 * with an environment variable still wins.
 */
export async function setAgentDefaults(fd: FormData): Promise<{ ok?: boolean; error?: string; detail?: string }> {
  await requireRole("admin");
  const t = await getT();
  const { settings, error } = settingsFromForm(fd);
  if (error || !settings) return { error: t("messages.agentSettingsInvalid", { field: error ?? "" }) };
  const value = Object.keys(settings).length ? settings : Prisma.DbNull;
  await prisma.setting.upsert({
    where: { id: "global" },
    update: { agentDefaults: value },
    create: { id: "global", agentDefaults: value },
  });
  revalidatePath("/agents");
  return { ok: true, detail: t("messages.agentSettingsSaved") };
}

/** One agent's own settings, over the defaults. Empty fields inherit. */
export async function setAgentSettings(agentId: string, fd: FormData): Promise<{ ok?: boolean; error?: string; detail?: string }> {
  await requireRole("admin");
  const t = await getT();
  const { settings, error } = settingsFromForm(fd);
  if (error || !settings) return { error: t("messages.agentSettingsInvalid", { field: error ?? "" }) };
  await prisma.agent.update({
    where: { id: agentId },
    data: { settings: Object.keys(settings).length ? settings : Prisma.DbNull },
  });
  revalidatePath("/agents");
  return { ok: true, detail: t("messages.agentSettingsSaved") };
}

/**
 * Pin an agent to a Coolify server (manual override), or clear it to re-enable
 * automatic detection. Used in multi-server instances where auto-detection is
 * ambiguous.
 */
export async function updateAgentServer(agentId: string, serverUuid: string | null) {
  await requireRole("admin");
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { error: (await getT())("messages.agentNotFound") };
  if (!serverUuid) {
    // Back to automatic detection.
    await prisma.agent.update({
      where: { id: agentId },
      data: { serverManual: false, serverUuid: null, serverName: null },
    });
  } else {
    // Resolve a friendly server name from a resource on that server.
    const sample = agent.instanceId
      ? await prisma.resource.findFirst({
          where: { instanceId: agent.instanceId, serverUuid },
          select: { serverName: true },
        })
      : null;
    await prisma.agent.update({
      where: { id: agentId },
      data: { serverManual: true, serverUuid, serverName: sample?.serverName ?? serverUuid },
    });
  }
  revalidatePath("/agents");
  revalidatePath("/instances");
  return { ok: true };
}

/* ----------------------------- destinations ----------------------------- */

export async function createDestination(fd: FormData) {
  await requireRole("admin");
  const name = s(fd, "name");
  const type = s(fd, "type");
  if (!name || !type) return { error: (await getT())("messages.nameAndTypeRequired") };
  // Storage engine: "restic" gives incremental/deduplicated/encrypted storage
  // (works over local, S3 and SSH/SFTP - including a jump host).
  const engine = s(fd, "engine") === "restic" ? "restic" : "tar";

  let config: unknown;
  if (type === "local") {
    // Local always writes to the agent host's persistent /backups volume
    // (mounted by the install command), so it survives agent recreation.
    config = { type: "local", basePath: "/backups" };
  } else if (type === "ssh") {
    const jumpHost = s(fd, "jumpHost");
    config = {
      type: "ssh",
      host: s(fd, "host"),
      port: Number(s(fd, "port") || "22"),
      username: s(fd, "username"),
      basePath: s(fd, "basePath"),
      password: s(fd, "password") || undefined,
      privateKey: s(fd, "privateKey") || undefined,
      // Optional bastion / jump host.
      ...(jumpHost
        ? {
            jumpHost,
            jumpPort: Number(s(fd, "jumpPort") || "22"),
            jumpUsername: s(fd, "jumpUsername") || undefined,
            jumpPassword: s(fd, "jumpPassword") || undefined,
            jumpPrivateKey: s(fd, "jumpPrivateKey") || undefined,
          }
        : {}),
    };
  } else if (type === "s3") {
    config = {
      type: "s3",
      endpoint: s(fd, "endpoint") || undefined,
      region: s(fd, "region") || "us-east-1",
      bucket: s(fd, "bucket"),
      prefix: s(fd, "prefix"),
      accessKeyId: s(fd, "accessKeyId"),
      secretAccessKey: s(fd, "secretAccessKey"),
      forcePathStyle: fd.get("forcePathStyle") === "on",
    };
  } else {
    return { error: (await getT())("messages.unknownDestinationType") };
  }

  // restic encrypts its repository natively, so the optional AES layer is only
  // for the tar engine.
  const encryptionEnabled = engine === "tar" && fd.get("encryptionEnabled") === "on";
  await prisma.destination.create({
    data: {
      name,
      type,
      engine,
      configEnc: encryptSecret(JSON.stringify(config)),
      encryptionEnabled,
      encryptionKeyEnc: encryptionEnabled ? encryptSecret(generateAesKeyB64()) : null,
      // A strong random repo password, generated once and stored encrypted.
      resticPasswordEnc: engine === "restic" ? encryptSecret(generateAesKeyB64()) : null,
    },
  });
  revalidatePath("/destinations");
  return { ok: true };
}

export async function deleteDestination(id: string): Promise<{ ok?: boolean; error?: string } | void> {
  await requireRole("admin");
  // Its schedules used to be cascade-deleted silently, so backups just stopped.
  const policies = await prisma.backupPolicy.findMany({ where: { destinationId: id }, select: { name: true } });
  if (policies.length > 0) {
    return {
      error: (await getT())("messages.destinationInUse", {
        count: policies.length,
        names: policies.map((p) => p.name).join(", "),
      }),
    };
  }
  const dest = await prisma.destination.findUnique({ where: { id } });
  if (dest) {
    // Delete the actual files first, before the records cascade away with the
    // destination. For a "local" destination the files live on each producing
    // agent's host, so group by agent; ssh/s3 group by instance (any agent).
    const snaps = await prisma.snapshot.findMany({
      where: { destinationId: id },
      select: { id: true, destinationDir: true, agentId: true, resticSnapshotId: true, resource: { select: { instanceId: true } } },
    });
    const groups = groupSnapshotsForPrune(
      snaps.map((s) => ({
        id: s.id,
        destinationDir: s.destinationDir,
        agentId: s.agentId,
        resticSnapshotId: s.resticSnapshotId,
        instanceId: s.resource.instanceId,
        destination: dest,
      })),
    );
    for (const g of groups) {
      await enqueuePrune({
        instanceId: g.instanceId,
        destination: g.destination,
        dirs: g.dirs,
        resticSnapshotIds: g.resticSnapshotIds,
        agentId: g.agentId,
      }).catch((e) => console.warn("[delete-destination] prune failed", (e as Error).message));
    }
  }
  await prisma.destination.delete({ where: { id } });
  revalidatePath("/destinations");
}

export async function testDestinationAction(id: string) {
  await requireRole("admin");
  const dest = await prisma.destination.findUniqueOrThrow({ where: { id } });
  const { testDestination } = await import("@/lib/destination-test");
  const result = await testDestination(resolveDestination(dest));
  const t = await getT();
  const text = (m: string | { key: string; vars?: Record<string, string | number> } | undefined) =>
    m === undefined ? undefined : typeof m === "string" ? m : t(m.key, m.vars);
  return { ok: result.ok, detail: text(result.detail), error: text(result.error) };
}

/* ----------------------------- jobs: cancel / retry ----------------------------- */

/** Cancel a snapshot's job if it's still queued (not yet picked up). */
export async function cancelSnapshot(snapshotId: string): Promise<void> {
  await requireRole("operator");
  // Guard against the agent claiming the job (queued -> running) between read and
  // write: updateMany is atomic on the status filter, so a job already in flight
  // is left untouched and we only fail the snapshot when we actually cancelled.
  const cancelled = await prisma.agentJob.updateMany({
    where: { snapshotId, type: "backup", status: "queued" },
    data: { status: "failed", error: "cancelled", finishedAt: new Date() },
  });
  if (cancelled.count > 0) {
    await prisma.snapshot.update({
      where: { id: snapshotId },
      data: { status: "failed", error: "cancelled", finishedAt: new Date() },
    });
  }
  revalidatePath("/snapshots");
}

/** Delete a snapshot: removes its files from the destination (via the agent),
 * then drops the record. If no agent is online the record is still removed and
 * the files are left in place. */
/**
 * Delete a snapshot (and its mirror copies): the files are deleted by an agent
 * first and the rows removed once that succeeded; meanwhile it shows "deleting".
 */
export async function deleteSnapshot(snapshotId: string): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("operator");
  const snap = await prisma.snapshot.findUnique({ where: { id: snapshotId }, select: { resourceId: true, status: true } });
  if (!snap) return { ok: true };
  if (snap.status === "running") return { error: (await getT())("messages.snapshotStillRunning") };
  await removeSnapshots([snapshotId]);
  revalidatePath("/snapshots");
  revalidatePath("/destinations");
  revalidatePath(`/resources/${snap.resourceId}`);
  return { ok: true };
}

/** Re-pin a Git app to the commit captured in a snapshot, then redeploy. */
export async function repinDeployment(snapshotId: string): Promise<{ ok?: boolean; error?: string; detail?: string }> {
  await requireRole("operator");
  const snap = await prisma.snapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: { resource: { include: { instance: true } } },
  });
  const manifest = snap.manifest as { provenance?: { gitCommitSha?: string } } | null;
  const sha = manifest?.provenance?.gitCommitSha;
  const t = await getT();
  if (!sha || sha === "HEAD") return { error: t("messages.noCommitToRepin") };
  const inst = snap.resource.instance;
  const client = new CoolifyClient(inst.baseUrl, decryptSecret(inst.apiTokenEnc));
  try {
    await client.repinCommit(snap.resource.coolifyUuid, sha);
    return { ok: true, detail: t("messages.repinned", { sha: sha.slice(0, 8) }) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Retry a failed backup by re-enqueuing its resource. */
export async function retrySnapshot(snapshotId: string): Promise<{ error?: string }> {
  await requireRole("operator");
  const snap = await prisma.snapshot.findUniqueOrThrow({ where: { id: snapshotId } });
  try {
    await enqueueBackup(snap.resourceId);
  } catch (e) {
    // Shown next to the button (busy resource, no live agent…) instead of a
    // silent "retried".
    return { error: errorText(e, await getT()) };
  }
  revalidatePath("/snapshots");
  return {};
}

/* ------------------------- schedules (inheritance) ------------------------- */

function scheduleData(fd: FormData) {
  return {
    cron: freqToCron(s(fd, "frequency") || "daily", s(fd, "customCron")),
    mode: s(fd, "mode") || "backup",
    destinationId: s(fd, "destinationId"),
    retentionDaily: Number(s(fd, "retentionDaily") || "7"),
    retentionWeekly: Number(s(fd, "retentionWeekly") || "4"),
    retentionMonthly: Number(s(fd, "retentionMonthly") || "6"),
  };
}

/** Why a schedule can't be saved (translated), or null. An invalid cron used to
 * be stored and then never fire (or, with a step of 0, freeze the scheduler). */
async function scheduleError(data: ReturnType<typeof scheduleData>): Promise<string | null> {
  const t = await getT();
  if (!data.destinationId) return t("messages.pickDestination");
  if (!isValidCron(data.cron)) return t("messages.invalidCron", { cron: data.cron });
  if (data.mode !== "backup" && data.mode !== "sync") return t("messages.unknownMode");
  for (const [k, v] of [
    ["daily", data.retentionDaily],
    ["weekly", data.retentionWeekly],
    ["monthly", data.retentionMonthly],
  ] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 1000) {
      return t("messages.invalidRetention", { period: t(`messages.retentionPeriod.${k}`) });
    }
  }
  return null;
}

/** Create/update the default schedule for a whole Coolify instance. */
export async function setInstanceSchedule(instanceId: string, fd: FormData) {
  await requireRole("admin");
  const data = scheduleData(fd);
  const invalid = await scheduleError(data);
  if (invalid) return { error: invalid };
  const instance = await prisma.coolifyInstance.findUniqueOrThrow({ where: { id: instanceId } });
  const existing = await prisma.backupPolicy.findFirst({ where: { instanceId, resourceId: null, serverUuid: null } });
  if (existing) {
    await prisma.backupPolicy.update({ where: { id: existing.id }, data });
  } else {
    await prisma.backupPolicy.create({ data: { ...data, name: `${instance.name} schedule`, instanceId } });
  }
  revalidatePath("/instances");
  revalidatePath("/resources");
  return { ok: true };
}

export async function removeInstanceSchedule(instanceId: string): Promise<void> {
  await requireRole("admin");
  await prisma.backupPolicy.deleteMany({ where: { instanceId, resourceId: null, serverUuid: null } });
  revalidatePath("/instances");
}

/** Create/update the schedule for one server of a Coolify instance. */
export async function setServerSchedule(instanceId: string, serverUuid: string, fd: FormData) {
  await requireRole("admin");
  const data = scheduleData(fd);
  const invalid = await scheduleError(data);
  if (invalid) return { error: invalid };
  const instance = await prisma.coolifyInstance.findUniqueOrThrow({ where: { id: instanceId } });
  const sample = await prisma.resource.findFirst({
    where: { instanceId, serverUuid },
    select: { serverName: true },
  });
  const serverName = sample?.serverName ?? serverUuid;
  const existing = await prisma.backupPolicy.findFirst({ where: { instanceId, serverUuid, resourceId: null } });
  if (existing) {
    await prisma.backupPolicy.update({ where: { id: existing.id }, data });
  } else {
    await prisma.backupPolicy.create({
      data: { ...data, name: `${instance.name} - ${serverName} schedule`, instanceId, serverUuid },
    });
  }
  revalidatePath("/instances");
  revalidatePath("/resources");
  return { ok: true };
}

export async function removeServerSchedule(instanceId: string, serverUuid: string): Promise<void> {
  await requireRole("admin");
  await prisma.backupPolicy.deleteMany({ where: { instanceId, serverUuid, resourceId: null } });
  revalidatePath("/instances");
}

/** Manually reconcile a destination now (detect backups deleted at rest). */
export async function verifyDestinationNow(destinationId: string) {
  await requireRole("operator");
  const t = await getT();
  try {
    const { queued, reason } = await enqueueVerifyDestination(destinationId);
    if (queued === 0) {
      return { error: t(reason === "no-agent" ? "messages.noAgentForCheck" : "messages.nothingToVerify") };
    }
    revalidatePath("/destinations");
    return { ok: true, detail: t(queued === 1 ? "messages.verifyQueuedOne" : "messages.verifyQueuedMany", { count: queued }) };
  } catch (e) {
    return { error: errorText(e, t) };
  }
}

/** Deep integrity check now: re-read stored content (restic check / tar
 * re-checksum) to catch silent corruption, not just missing files. */
export async function checkIntegrityNow(destinationId: string) {
  await requireRole("operator");
  const t = await getT();
  try {
    const { queued, reason } = await enqueueVerifyDestination(destinationId, { deep: true });
    if (queued === 0) {
      return { error: t(reason === "no-agent" ? "messages.noAgentForCheck" : "messages.nothingToCheck") };
    }
    revalidatePath("/destinations");
    return {
      ok: true,
      detail: t(queued === 1 ? "messages.integrityQueuedOne" : "messages.integrityQueuedMany", { count: queued }),
    };
  } catch (e) {
    return { error: errorText(e, t) };
  }
}

/** Set (or clear) the second destination this one mirrors every backup to. */
export async function setDestinationMirror(
  destinationId: string,
  mirrorToId: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  const t = await getT();
  try {
    await requireRole("admin");
    if (mirrorToId === destinationId) return { error: t("messages.mirrorSelf") };
    if (mirrorToId) {
      const target = await prisma.destination.findUnique({ where: { id: mirrorToId }, select: { id: true, mirrorToId: true } });
      if (!target) return { error: t("messages.mirrorTargetNotFound") };
      if (target.mirrorToId === destinationId) return { error: t("messages.mirrorLoop") };
    }
    await prisma.destination.update({ where: { id: destinationId }, data: { mirrorToId } });
    revalidatePath("/destinations");
    return { ok: true };
  } catch (e) {
    return { error: errorText(e, t) };
  }
}

/** Toggle the weekly deep integrity check for a destination. */
export async function setIntegrityCheck(destinationId: string, enabled: boolean): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireRole("admin");
    await prisma.destination.update({ where: { id: destinationId }, data: { integrityCheckEnabled: enabled } });
    revalidatePath("/destinations");
    return { ok: true };
  } catch (e) {
    return { error: errorText(e, await getT()) };
  }
}

/** Create/update a per-resource override schedule. */
export async function setResourceSchedule(resourceId: string, fd: FormData) {
  await requireRole("admin");
  const data = scheduleData(fd);
  const invalid = await scheduleError(data);
  if (invalid) return { error: invalid };
  const resource = await prisma.resource.findUniqueOrThrow({ where: { id: resourceId } });
  const existing = await prisma.backupPolicy.findFirst({ where: { resourceId } });
  if (existing) {
    await prisma.backupPolicy.update({ where: { id: existing.id }, data });
  } else {
    await prisma.backupPolicy.create({ data: { ...data, name: `${resource.name} override`, resourceId } });
  }
  // Setting a schedule on a resource implies it should be backed up.
  await prisma.resource.update({ where: { id: resourceId }, data: { backupEnabled: true } });
  revalidatePath(`/resources/${resourceId}`);
  return { ok: true };
}

/** Drop a resource override so it inherits its instance schedule again. */
export async function removeResourceOverride(resourceId: string): Promise<void> {
  await requireRole("admin");
  await prisma.backupPolicy.deleteMany({ where: { resourceId } });
  revalidatePath(`/resources/${resourceId}`);
}

/* ----------------------------- resources ----------------------------- */

/** Update a resource's per-resource backup settings (auto-saved from the UI). */
export async function updateResourceSettings(resourceId: string, fd: FormData): Promise<void> {
  await requireRole("operator");
  await prisma.resource.update({
    where: { id: resourceId },
    data: {
      backupEnabled: fd.get("backupEnabled") === "on",
      liveBackup: fd.get("liveBackup") === "on",
    },
  });
  revalidatePath("/resources");
  revalidatePath(`/resources/${resourceId}`);
}

/** Save a resource's per-container pre/post-backup hooks (empty entries dropped). */
/**
 * Save per-container pre/post-backup hooks. Admin-only: a hook runs an arbitrary
 * command inside a production container, which is configuration, not operation.
 * `container` is "" (primary container), a compose service name or a container name.
 */
export async function updateResourceHooks(
  resourceId: string,
  hooks: { container: string; pre?: string; post?: string; timeoutSec?: number | string }[],
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("admin");
  const clean: { container: string; pre?: string; post?: string; timeoutSec?: number }[] = [];
  for (const h of hooks ?? []) {
    const pre = (h.pre ?? "").trim() || undefined;
    const post = (h.post ?? "").trim() || undefined;
    if (!pre && !post) continue;
    if ((pre?.length ?? 0) > 4000 || (post?.length ?? 0) > 4000) return { error: (await getT())("messages.hookTooLong") };
    const raw = typeof h.timeoutSec === "string" ? h.timeoutSec.trim() : h.timeoutSec;
    let timeoutSec: number | undefined;
    if (raw !== undefined && raw !== "") {
      timeoutSec = Number(raw);
      if (!Number.isInteger(timeoutSec) || timeoutSec < 1 || timeoutSec > 3600) {
        return { error: (await getT())("messages.hookTimeoutInvalid") };
      }
    }
    clean.push({ container: (h.container ?? "").trim().slice(0, 200), pre, post, ...(timeoutSec ? { timeoutSec } : {}) });
  }
  await prisma.resource.update({
    where: { id: resourceId },
    data: { hooks: clean.length ? clean : Prisma.DbNull },
  });
  revalidatePath(`/resources/${resourceId}`);
  return { ok: true };
}

export async function backupNow(resourceId: string): Promise<{ ok?: boolean; error?: string; detail?: string }> {
  await requireRole("operator");
  const t = await getT();
  try {
    await enqueueBackup(resourceId);
  } catch (e) {
    return { error: errorText(e, t) };
  }
  revalidatePath("/snapshots");
  revalidatePath(`/resources/${resourceId}`);
  return { ok: true, detail: t("messages.backupQueued") };
}

export async function restoreSnapshot(
  snapshotId: string,
  target: "in_place" | "new_resource",
  /** Restore "→ new" onto a DIFFERENT connected Coolify (migration). */
  targetInstanceId?: string,
): Promise<{ ok?: boolean; error?: string; detail?: string }> {
  await requireRole("operator");
  const t = await getT();
  try {
    await enqueueRestore(snapshotId, target, targetInstanceId);
  } catch (e) {
    return { error: errorText(e, t) };
  }
  revalidatePath("/snapshots");
  revalidatePath(`/snapshots/${snapshotId}`);
  return { ok: true, detail: t(target === "in_place" ? "messages.restoreQueued" : "messages.restoreNewQueued") };
}

/* ----------------------------- users & invitations ----------------------------- */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** How many admins exist — used to protect the last admin from demotion/removal. */
async function adminCount(): Promise<number> {
  return prisma.user.count({ where: { role: "admin" } });
}

/**
 * Create an invitation for `email` with a preset `role`. Returns the one-time
 * link (shown once, reveal-style). If `sendEmail` is set and SMTP is verified,
 * the link is also emailed; either way the link is returned for copying.
 */
export async function createInvitation(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string; link?: string; emailed?: boolean }> {
  const me = await requireRole("admin");
  const email = s(fd, "email").toLowerCase();
  const role = s(fd, "role");
  const sendEmail = fd.get("sendEmail") === "on";
  const t = await getT();
  if (!EMAIL_RE.test(email)) return { error: t("messages.invalidEmail") };
  if (!isRole(role)) return { error: t("messages.pickRole") };

  // A pre-existing account or a still-pending invite would be confusing.
  const existingUser = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existingUser) return { error: t("messages.userExists") };

  const token = "cbm_inv_" + randomToken(24);
  await prisma.invitation.create({
    data: {
      email,
      role,
      tokenHash: sha256Hex(token),
      expiresAt: inviteExpiry(new Date()),
      createdById: me.id,
    },
  });

  const link = `${env.authUrl.replace(/\/$/, "")}/invite/${token}`;

  let emailed = false;
  if (sendEmail) {
    const { smtpReady, sendMail } = await import("@/lib/email");
    if (await smtpReady()) {
      try {
        await sendMail({
          to: email,
          subject: "You're invited to CBM",
          text: `You've been invited to Coolify Backup Manager as "${role}".\n\nAccept your invitation (valid 48h):\n\n${link}\n\nIf you didn't expect this, you can ignore this email.`,
        });
        emailed = true;
      } catch (e) {
        console.warn("[invite] email send failed", (e as Error).message);
      }
    }
  }

  revalidatePath("/users");
  return { ok: true, link, emailed };
}

/**
 * Public: called from the invite-acceptance page when the invitee opens a valid
 * link. Marks the invite "claimed" (proving token possession), which is what
 * lets the otherwise-closed registration gate accept the subsequent signup.
 */
export async function claimInvitation(token: string): Promise<{ ok?: boolean; error?: string; email?: string }> {
  const t = await getT();
  if (!token) return { error: t("messages.missingInviteToken") };
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!invite || invite.acceptedAt) return { error: t("messages.inviteInvalid") };
  if (invite.expiresAt.getTime() <= Date.now()) return { error: t("messages.inviteExpired") };
  await prisma.invitation.update({ where: { id: invite.id }, data: { claimedAt: new Date() } });
  return { ok: true, email: invite.email };
}

/** Delete a pending invitation. */
export async function revokeInvitation(id: string): Promise<void> {
  await requireRole("admin");
  await prisma.invitation.delete({ where: { id } }).catch(() => {});
  revalidatePath("/users");
}

/** Change a user's role. Refuses to demote the last remaining admin. */
export async function setUserRole(userId: string, role: string): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("admin");
  const t = await getT();
  if (!isRole(role)) return { error: t("messages.unknownRole") };
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: t("messages.userNotFound") };
  if (target.role === "admin" && role !== "admin" && (await adminCount()) <= 1) {
    return { error: t("messages.lastAdminDemote") };
  }
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/users");
  return { ok: true };
}

/** Remove a user (cascades sessions/accounts). Refuses self and the last admin. */
export async function removeUser(userId: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireRole("admin");
  const t = await getT();
  if (userId === me.id) return { error: t("messages.cantRemoveSelf") };
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: t("messages.userNotFound") };
  if (target.role === "admin" && (await adminCount()) <= 1) {
    return { error: t("messages.lastAdminRemove") };
  }
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/users");
  return { ok: true };
}

/* --------------------------- two-factor authentication --------------------------- */

/**
 * Reset another user's two-factor sign-in (lost phone and backup codes): their
 * TOTP secret, backup codes, trusted devices and sessions go. They set it up
 * again at their next sign-in if the policy requires it. Your own 2FA is
 * managed from Profile.
 */
export async function resetUserTwoFactor(userId: string): Promise<{ ok?: boolean; error?: string; detail?: string }> {
  const me = await requireRole("admin");
  const t = await getT();
  if (userId === me.id) return { error: t("messages.twoFactorResetSelf") };
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return { error: t("messages.userNotFound") };
  await resetTwoFactor([userId]);
  revalidatePath("/users");
  return { ok: true, detail: t("messages.twoFactorReset") };
}

/** Who must use two-factor sign-in: "optional", "admins" or "everyone". */
export async function setTwoFactorPolicy(policy: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireRole("admin");
    if (!isTwoFactorPolicy(policy)) return { error: (await getT())("messages.twoFactorPolicyInvalid") };
    await prisma.setting.upsert({
      where: { id: "global" },
      update: { twoFactorPolicy: policy },
      create: { id: "global", twoFactorPolicy: policy },
    });
    revalidatePath("/settings");
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { error: errorText(e, await getT()) };
  }
}

/* ----------------------------- API tokens (MCP) ----------------------------- */

/**
 * Mint a machine API token for the MCP server / external AI agents. Admin-only;
 * the token's own role (viewer | operator | admin) gates the /api/v1 surface it
 * can reach. The plaintext is returned ONCE here and never stored — only its
 * sha256 hash and a masked hint are kept.
 */
export async function createApiToken(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string; token?: string; name?: string }> {
  await requireRole("admin");
  const name = s(fd, "name");
  const role = s(fd, "role") || "viewer";
  const t = await getT();
  if (!name) return { error: t("messages.tokenNameRequired") };
  if (!isRole(role)) return { error: t("messages.pickRole") };

  const token = "cbm_pat_" + randomToken(24);
  const hint = `${token.slice(0, 12)}…${token.slice(-4)}`;
  await prisma.apiToken.create({
    data: { name, role, tokenHash: sha256Hex(token), tokenHint: hint, createdById: (await requireUser()).id },
  });

  revalidatePath("/settings");
  return { ok: true, token, name };
}

/** Revoke (delete) an API token. Admin-only; the token stops working at once. */
export async function revokeApiToken(id: string): Promise<void> {
  await requireRole("admin");
  await prisma.apiToken.delete({ where: { id } }).catch(() => {});
  revalidatePath("/settings");
}

/* ----------------------------- restore drills ----------------------------- */

/**
 * Test-restore a snapshot now: an agent restores it into a throwaway sandbox
 * (never Coolify, never the original resource) and reports what it verified.
 */
export async function drillSnapshotNow(snapshotId: string): Promise<{ ok?: boolean; error?: string; detail?: string }> {
  await requireRole("operator");
  const t = await getT();
  try {
    await enqueueDrill(snapshotId, "manual");
  } catch (e) {
    return { error: errorText(e, t) };
  }
  revalidatePath(`/snapshots/${snapshotId}`);
  revalidatePath("/snapshots");
  return { ok: true, detail: t("messages.drillQueued") };
}

/** Turn the weekly automatic restore drills on or off. */
export async function setDrillsEnabled(enabled: boolean): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireRole("admin");
    await prisma.setting.upsert({
      where: { id: "global" },
      update: { drillsEnabled: enabled },
      create: { id: "global", drillsEnabled: enabled },
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: errorText(e, await getT()) };
  }
}
