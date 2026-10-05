// Better Auth reports failures as { code, message } with an English message.
// Translate the codes users actually hit; anything else shows as sent. Pure, so
// both the client auth forms and the server actions use it.
import type { T } from "./i18n-shared";

/** Codes thrown by our own hooks in lib/auth.ts. */
export const PASSWORD_BREACHED = "PASSWORD_BREACHED";
export const REGISTRATION_CLOSED = "REGISTRATION_CLOSED";

const KNOWN = new Set([
  PASSWORD_BREACHED,
  REGISTRATION_CLOSED,
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_PASSWORD",
  "INVALID_EMAIL",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "USER_ALREADY_EXISTS",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
]);

export type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

/** User-facing text for a Better Auth error, falling back to `fallbackKey`. */
export function authErrorText(err: AuthErrorLike, t: T, fallbackKey: string): string {
  if (err?.code && KNOWN.has(err.code)) return t(`auth.errors.${err.code}`);
  if (err?.status === 429) return t("auth.errors.TOO_MANY_REQUESTS");
  return err?.message || t(fallbackKey);
}
