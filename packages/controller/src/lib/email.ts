import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { env } from "./env";
import { decryptSecret } from "./crypto";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  fromName?: string;
}

/** Which SMTP fields are forced by an env var (so the UI can show them locked). */
export function smtpEnvOverrides() {
  return {
    host: !!env.smtp.host,
    port: !!env.smtp.port,
    secure: !!env.smtp.secure,
    user: !!env.smtp.user,
    password: !!env.smtp.password,
    from: !!env.smtp.from,
    fromName: !!env.smtp.fromName,
  };
}

/**
 * Effective SMTP config: an env var wins per field, otherwise the value saved in
 * Settings (DB). Returns null if host or From is missing (i.e. not configured).
 */
export async function effectiveSmtp(): Promise<SmtpConfig | null> {
  const s = await prisma.setting.findUnique({ where: { id: "global" } }).catch(() => null);
  const host = env.smtp.host || s?.smtpHost || "";
  const from = env.smtp.from || s?.smtpFrom || "";
  if (!host || !from) return null;
  const portStr = env.smtp.port || (s?.smtpPort != null ? String(s.smtpPort) : "");
  const port = Number(portStr) || 587;
  const secure = env.smtp.secure ? env.smtp.secure === "true" : (s?.smtpSecure ?? port === 465);
  const user = env.smtp.user || s?.smtpUser || "";
  const password = env.smtp.password || (s?.smtpPasswordEnc ? decryptSecret(s.smtpPasswordEnc) : "");
  return {
    host,
    port,
    secure,
    user: user || undefined,
    password: password || undefined,
    from,
    fromName: env.smtp.fromName || s?.smtpFromName || undefined,
  };
}

/** Is SMTP configured at all (via env or Settings)? */
export async function smtpConfigured(): Promise<boolean> {
  return (await effectiveSmtp()) !== null;
}

/**
 * Is SMTP usable for the forgot-password link + the verification toggle? Env-
 * provided config is trusted; DB-provided config must have passed a "send test".
 */
export async function smtpReady(): Promise<boolean> {
  if (!(await effectiveSmtp())) return false;
  if (env.smtp.host) return true;
  const s = await prisma.setting.findUnique({ where: { id: "global" } }).catch(() => null);
  return !!s?.smtpLastVerifiedOk;
}

function transport(c: SmtpConfig) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.password } : undefined,
  });
}

/** Verify a connection/login for an SMTP config (used by the "send test" action). */
export async function verifySmtp(c: SmtpConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await transport(c).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Send an email via the effective SMTP config. No-op (logged) if unconfigured. */
export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const c = await effectiveSmtp();
  if (!c) {
    console.warn(`[email] SMTP not configured; skipped "${opts.subject}" to ${opts.to}`);
    return;
  }
  const from = c.fromName ? `"${c.fromName}" <${c.from}>` : c.from;
  await transport(c).sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
}
