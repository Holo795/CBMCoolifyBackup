import { createHmac } from "node:crypto";
import { cache } from "react";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie, expireCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { prisma } from "./prisma";
import { isTwoFactorPolicy, type TwoFactorPolicy } from "./two-factor-policy";

/*
 * Two-factor authentication (TOTP app + backup codes) is Better Auth's
 * two-factor plugin. This module adds what the plugin leaves out:
 *  - the admin policy (optional / required for admins / required for everyone);
 *  - the same challenge after a GitHub / Google / GitLab sign-in, which the
 *    plugin only applies to email + password sign-in;
 *  - an admin reset, and a reset of everyone after a recovery-file import.
 */

/** Cookie names and lifetimes shared with the plugin (see its constant.ts). */
const TWO_FACTOR_COOKIE = "two_factor";
const TRUST_DEVICE_COOKIE = "trust_device";
export const TRUST_DEVICE_MAX_AGE = 30 * 24 * 60 * 60;
export const CHALLENGE_MAX_AGE = 10 * 60;

export { TWO_FACTOR_POLICIES, isTwoFactorPolicy, twoFactorRequired, type TwoFactorPolicy } from "./two-factor-policy";

/** The admin-set policy (cached per request: read on every page and action). */
export const getTwoFactorPolicy = cache(async (): Promise<TwoFactorPolicy> => {
  const s = await prisma.setting.findUnique({ where: { id: "global" }, select: { twoFactorPolicy: true } }).catch(() => null);
  return s && isTwoFactorPolicy(s.twoFactorPolicy) ? s.twoFactorPolicy : "optional";
});

/** HMAC-SHA256, base64url without padding - the plugin's trust-device token. */
function trustToken(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/**
 * After a social sign-in (GitHub / Google / GitLab): if the account has 2FA,
 * swap the session that was just created for the plugin's pending challenge
 * and send the browser to the code page - exactly what the plugin does after
 * an email + password sign-in, so its verify endpoints finish the job. A device
 * the user chose to trust skips the challenge, as with a password sign-in.
 */
export const oauthTwoFactorGate = createAuthMiddleware(async (ctx) => {
  if (!/^\/(oauth2\/)?callback\//.test(ctx.path)) return;
  const data = ctx.context.newSession;
  if (!data || !(data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) return;
  const secret = ctx.context.secret;

  const trustAttrs = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE, { maxAge: TRUST_DEVICE_MAX_AGE });
  const trusted = await ctx.getSignedCookie(trustAttrs.name, secret);
  if (trusted) {
    const [token, identifier] = trusted.split("!");
    if (token && identifier && token === trustToken(secret, `${data.user.id}!${identifier}`)) {
      const record = await ctx.context.internalAdapter.findVerificationValue(identifier);
      if (record && record.value === data.user.id && record.expiresAt > new Date()) {
        // Rotate the trust token, as the plugin does.
        await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
        const next = `trust-device-${generateRandomString(32)}`;
        await ctx.context.internalAdapter.createVerificationValue({
          value: data.user.id,
          identifier: next,
          expiresAt: new Date(Date.now() + TRUST_DEVICE_MAX_AGE * 1000),
        });
        await ctx.setSignedCookie(trustAttrs.name, `${trustToken(secret, `${data.user.id}!${next}`)}!${next}`, secret, trustAttrs.attributes);
        return;
      }
    }
    expireCookie(ctx, trustAttrs);
  }

  deleteSessionCookie(ctx, true);
  await ctx.context.internalAdapter.deleteSession(data.session.token);
  ctx.context.setNewSession(null);
  const challenge = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE, { maxAge: CHALLENGE_MAX_AGE });
  const identifier = `2fa-${generateRandomString(20)}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_MAX_AGE * 1000);
  await ctx.context.internalAdapter.createVerificationValue({ value: data.user.id, identifier, expiresAt });
  await ctx.context.internalAdapter.createVerificationValue({ value: "0", identifier: `2fa-attempts-${identifier}`, expiresAt });
  await ctx.setSignedCookie(challenge.name, identifier, secret, challenge.attributes);
  throw ctx.redirect("/two-factor");
});

/**
 * Turn 2FA off for some accounts (all when `userIds` is omitted): their TOTP
 * secrets and backup codes, trusted devices and sessions go. Used by an
 * admin's reset (lost phone) and after a recovery-file import, whose new auth
 * secret can't decrypt the old TOTP secrets.
 */
export async function resetTwoFactor(userIds?: string[]): Promise<void> {
  const users = userIds ? { userId: { in: userIds } } : {};
  await prisma.$transaction([
    prisma.twoFactor.deleteMany({ where: users }),
    prisma.user.updateMany({ where: userIds ? { id: { in: userIds } } : {}, data: { twoFactorEnabled: false } }),
    prisma.verification.deleteMany({
      where: { identifier: { startsWith: "trust-device-" }, ...(userIds ? { value: { in: userIds } } : {}) },
    }),
    ...(userIds ? [prisma.session.deleteMany({ where: { userId: { in: userIds } } })] : []),
  ]);
}
