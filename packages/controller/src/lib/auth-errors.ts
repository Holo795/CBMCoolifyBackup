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
  // Two-factor plugin
  "INVALID_CODE",
  "INVALID_BACKUP_CODE",
  "INVALID_TWO_FACTOR_COOKIE",
  "ACCOUNT_TEMPORARILY_LOCKED",
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
]);

export type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

/** Error codes a single sign-on can come back with (in `?error=`), translated. */
const SSO_ERRORS = new Set([
  REGISTRATION_CLOSED,
  "access_denied",
  "account_not_linked",
  "unable_to_link_account",
  "account_already_linked_to_different_user",
  "email_not_found",
  "email_does_not_match",
  "invalid_code",
  "state_not_found",
  "state_mismatch",
  "please_restart_the_process",
  "unable_to_get_user_info",
  "oauth_provider_not_found",
  "issuer_mismatch",
  "unable_to_create_user",
]);

/** User-facing text for the `?error=` a failed single sign-on returns with. */
export function ssoErrorText(code: string | undefined, t: T): string | null {
  if (!code) return null;
  if (SSO_ERRORS.has(code)) return t(`auth.ssoErrors.${code}`);
  return t("auth.ssoErrors.other", { code: code.slice(0, 80) });
}

/** User-facing text for a Better Auth error, falling back to `fallbackKey`. */
export function authErrorText(err: AuthErrorLike, t: T, fallbackKey: string): string {
  if (err?.code && KNOWN.has(err.code)) return t(`auth.errors.${err.code}`);
  if (err?.status === 429) return t("auth.errors.TOO_MANY_REQUESTS");
  return err?.message || t(fallbackKey);
}
