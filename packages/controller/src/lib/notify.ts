import { prisma } from "./prisma";
import { env } from "./env";

async function webhookUrl(): Promise<string | undefined> {
  const s = await prisma.setting.findUnique({ where: { id: "global" } }).catch(() => null);
  return s?.alertWebhookUrl || undefined;
}

/**
 * Post a plain message to the configured webhook. The body carries both
 * `content` (Discord) and `text` (Slack) so one URL works for either, plus most
 * custom receivers. No-op when no webhook is configured.
 */
export async function sendAlert(message: string): Promise<void> {
  const url = await webhookUrl();
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: message, text: message }),
  }).catch((e) => console.warn("[alert] webhook failed:", (e as Error).message));
}

/** Send a test message (used by the Settings page to verify the webhook). */
export async function sendTestAlert(url: string): Promise<boolean> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: "✅ Coolify Backup Manager — test notification. Webhook is working.",
      text: "✅ Coolify Backup Manager — test notification. Webhook is working.",
    }),
  })
    .then((r) => r.ok)
    .catch(() => false);
}

/** Notify that a backup snapshot failed (best-effort). */
export async function notifyBackupFailed(snapshotId: string): Promise<void> {
  const snap = await prisma.snapshot
    .findUnique({ where: { id: snapshotId }, include: { resource: { include: { instance: true } } } })
    .catch(() => null);
  if (!snap) return;
  const base = (env.authUrl || "").replace(/\/$/, "");
  const link = base ? `\n${base}/snapshots/${snap.id}` : "";
  await sendAlert(
    `❌ Backup failed — **${snap.resource.name}** (${snap.resource.instance.name})\n${snap.error ?? "unknown error"}${link}`,
  );
}
