import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { isPasswordCompromised } from "better-auth/plugins/haveibeenpwned";
import { twoFactor } from "better-auth/plugins/two-factor";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { BetterAuthOptions } from "better-auth";
import { oidcDiscoveryUrl, ssoConfigs, type SsoConfig, type SsoProviderId } from "./sso";
import { prisma } from "./prisma";
import { env } from "./env";
import { sendMail } from "./email";
import { decideInviteSignup } from "./invitations";
import { PASSWORD_BREACHED, REGISTRATION_CLOSED, SETUP_TOKEN_INVALID } from "./auth-errors";
import { SETUP_TOKEN_HEADER, clearSetupToken, holdSetupToken, setupAuthorizes } from "./setup-token";
import { trustedProxyList } from "./rate-limit";
import { oauthTwoFactorGate, TRUST_DEVICE_MAX_AGE, CHALLENGE_MAX_AGE } from "./two-factor";

/** Kept for the sign-in pages' types: the provider ids a button can carry. */
export type OAuthProvider = SsoProviderId;

/** Endpoints that set a new password (body.password or body.newPassword). */
const NEW_PASSWORD_PATHS = new Set(["/sign-up/email", "/change-password", "/reset-password"]);
const BREACH_CHECK_TIMEOUT_MS = 3000;

/**
 * Is this password in a known breach? Unlike better-auth's haveIBeenPwned
 * plugin this fails OPEN: a self-hosted install without Internet access (or
 * an HIBP outage) must still be able to sign up and reset passwords.
 */
async function passwordBreached(password: string): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), BREACH_CHECK_TIMEOUT_MS).unref());
  return Promise.race([isPasswordCompromised(password).catch(() => false), timeout]);
}

/** Providers that only return emails their owner verified. */
const VERIFYING_PROVIDERS = new Set<SsoProviderId>(["google", "github"]);

/** Better Auth's options for a set of single sign-on providers (see lib/sso). */
function authOptions(sso: SsoConfig[]) {
  const social = (id: "github" | "google" | "gitlab") => sso.find((c) => c.id === id);
  const socialProviders: Record<string, { clientId: string; clientSecret: string; issuer?: string }> = {};
  for (const id of ["github", "google", "gitlab"] as const) {
    const c = social(id);
    if (!c) continue;
    socialProviders[id] = {
      clientId: c.clientId,
      clientSecret: c.clientSecret,
      // Self-managed GitLab; gitlab.com when unset.
      ...(id === "gitlab" && c.issuer ? { issuer: c.issuer.replace(/\/+$/, "") } : {}),
    };
  }
  const oidc = sso.find((c) => c.id === "oidc");
  return {

  // Shown as the issuer in authenticator apps.
  appName: "CBM",
  // A failed single sign-on comes back to the sign-in page with ?error=, which
  // it explains (lib/auth-errors), instead of Better Auth's bare error page.
  onAPIError: { errorURL: `${env.authUrl.replace(/\/+$/, "")}/login` },
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.authSecret,
  baseURL: env.authUrl,
  // Throttle the credential endpoints against brute force. better-auth only
  // enables its limiter in production by default, and its default budget is
  // generous, so: always on, with strict per-IP rules on the sensitive paths
  // (normal session traffic keeps the default budget).
  // The client's address behind the reverse proxy, the same way as the API's
  // own limiter (lib/rate-limit): past the trusted proxies, or from the one
  // header the proxy sets. Without either, Better Auth takes a lone
  // X-Forwarded-For value as is and puts a chain in one shared bucket.
  advanced: {
    ipAddress: {
      ...(trustedProxyList().length ? { trustedProxies: trustedProxyList() } : {}),
      ...(process.env.CLIENT_IP_HEADER?.trim() ? { ipAddressHeaders: [process.env.CLIENT_IP_HEADER.trim().toLowerCase()] } : {}),
    },
  },
  rateLimit: {
    enabled: true,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 5 },
      "/reset-password": { window: 300, max: 10 },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Soft verification: we never hard-block sign-in (see emailVerification).
    requireEmailVerification: false,
    autoSignIn: true,
    // Forgot-password: emails the reset link via the configured SMTP. No SMTP →
    // no email is sent (the UI hides the link unless SMTP is verified).
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your CBM password",
        text: `Reset your CBM password:\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
      });
    },
  },
  user: {
    // First/last name; the display `name` is kept as "First Last".
    additionalFields: {
      firstName: { type: "string", required: false },
      lastName: { type: "string", required: false },
      // Server-owned: set by the registration gate (first user → admin, invited
      // users → their invite's role). input:false stops a signup body from
      // self-assigning a role. The gate always sets it; a path that wouldn't
      // gets the least.
      role: { type: "string", required: false, input: false, defaultValue: "viewer" },
    },
    changeEmail: {
      enabled: true,
      // Sent to the CURRENT address to approve a change (only when the current
      // email is verified; an unverified email changes directly).
      updateEmailWithoutVerification: true,
      sendChangeEmailConfirmation: async ({
        user,
        newEmail,
        url,
      }: {
        user: { email: string };
        newEmail: string;
        url: string;
      }) => {
        await sendMail({
          to: user.email,
          subject: "Confirm your new CBM email",
          text: `Approve changing your CBM email to ${newEmail}:\n\n${url}`,
        });
      },
    },
  },
  // Account verification, soft mode: a link is emailed but sign-in is never
  // blocked. The send is gated on the Settings toggle, so it's effectively
  // dynamic (no restart needed to turn it on/off).
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      const s = await prisma.setting.findUnique({ where: { id: "global" } }).catch(() => null);
      if (!s?.requireEmailVerification) return;
      await sendMail({
        to: user.email,
        subject: "Verify your CBM email",
        text: `Verify your CBM email address:\n\n${url}`,
      });
    },
  },
  socialProviders,
  account: {
    // An existing CBM account is linked to a provider on its first sign-in
    // only when that provider verifies the emails it returns: Google and
    // GitHub. A GitLab or OpenID Connect server may let a user claim any
    // address - linking on it would let them sign in as that CBM account. With
    // those, the account is linked from Profile → Single sign-on, signed in.
    // Links made before stay; new accounts still sign up through an invite.
    accountLinking: {
      enabled: true,
      trustedProviders: sso.filter((c) => VERIFYING_PROVIDERS.has(c.id)).map((c) => c.id),
      requireLocalEmailVerified: false,
    },
  },
  plugins: [
    // Two-factor sign-in: an authenticator app (TOTP) plus single-use backup
    // codes. allowPasswordless lets an account that only signs in with GitHub /
    // Google / GitLab set it up too. The challenge after a social sign-in and
    // the admin policy live in lib/two-factor.ts.
    twoFactor({
      issuer: "CBM",
      allowPasswordless: true,
      trustDeviceMaxAge: TRUST_DEVICE_MAX_AGE,
      twoFactorCookieMaxAge: CHALLENGE_MAX_AGE,
      // Encrypted like the TOTP secret, so they never sit readable in the database
      // or the metadata self-backup (the plugin's current default; kept explicit).
      backupCodeOptions: { storeBackupCodes: "encrypted" },
    }),
    // Any OpenID Connect provider (Authentik, Keycloak...), found by discovery.
    ...(oidc
      ? [
          genericOAuth({
            config: [
              {
                providerId: "oidc",
                clientId: oidc.clientId,
                clientSecret: oidc.clientSecret,
                discoveryUrl: oidcDiscoveryUrl(oidc.issuer ?? ""),
                scopes: ["openid", "email", "profile"],
              },
            ],
          }),
        ]
      : []),
  ],
  // localhost:3000 is the dev server; in production only the configured URL.
  trustedOrigins: env.isProd ? [env.authUrl] : [env.authUrl, "http://localhost:3000"],
  hooks: {
    after: oauthTwoFactorGate,
    before: createAuthMiddleware(async (ctx) => {
      // The first account: the setup token is checked (and held for this email)
      // before anything else, so a wrong one never reaches the breach check.
      if (ctx.path === "/sign-up/email" && (await prisma.user.count()) === 0) {
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        const token = ctx.headers?.get(SETUP_TOKEN_HEADER) ?? "";
        if (typeof email !== "string" || !(await holdSetupToken(token, email))) {
          throw new APIError("FORBIDDEN", {
            code: SETUP_TOKEN_INVALID,
            message: "The setup token is missing or wrong - it is printed in the controller's logs at startup.",
          });
        }
      }
      if (!env.passwordBreachCheck || !NEW_PASSWORD_PATHS.has(ctx.path)) return;
      const body = ctx.body as { password?: unknown; newPassword?: unknown } | undefined;
      const password = body?.newPassword ?? body?.password;
      if (typeof password !== "string" || !password) return;
      if (await passwordBreached(password)) {
        // The code lets the sign-up / reset / profile forms translate it.
        throw new APIError("BAD_REQUEST", {
          code: PASSWORD_BREACHED,
          message: "This password appears in a known data breach - choose another one.",
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // The first person to register, with the setup token, becomes the admin
        // (an SSO sign-in can't present it); afterwards self-signup
        // is closed and only an *invited* email may register. An invite must have
        // been claimed (its link opened, proving token possession) and still be
        // pending/unexpired. Blocks every sign-up path (email + social) otherwise.
        before: async (user) => {
          const userCount = await prisma.user.count();
          const now = new Date();
          const invite =
            userCount === 0
              ? null
              : await prisma.invitation.findFirst({
                  where: {
                    email: { equals: user.email, mode: "insensitive" },
                    acceptedAt: null,
                    claimedAt: { not: null },
                    expiresAt: { gt: now },
                  },
                  orderBy: { createdAt: "desc" },
                });
          const decision = decideInviteSignup({
            userCount,
            email: user.email,
            setupOk: userCount === 0 && (await setupAuthorizes(user.email)),
            invite: invite
              ? {
                  email: invite.email,
                  role: invite.role,
                  expiresAt: invite.expiresAt,
                  claimedAt: invite.claimedAt,
                  acceptedAt: invite.acceptedAt,
                }
              : null,
            now,
          });
          if (!decision.allow) {
            throw new APIError("FORBIDDEN", {
              code: REGISTRATION_CLOSED,
              message: "Registration is closed - ask an admin for an invite link.",
            });
          }
          return { data: decision.role ? { ...user, role: decision.role } : user };
        },
        // Consume the invite that authorized this signup (single use), or the
        // setup token for the first account.
        after: async (user) => {
          await clearSetupToken().catch(() => undefined);
          await prisma.invitation.updateMany({
            where: {
              email: { equals: user.email, mode: "insensitive" },
              acceptedAt: null,
              claimedAt: { not: null },
            },
            data: { acceptedAt: new Date() },
          });
        },
      },
    },
  },
  } satisfies BetterAuthOptions;
}

/**
 * The instance for server-side calls (session, password, profile): those never
 * depend on the sign-in providers. The HTTP endpoints go through
 * getRequestAuth(), rebuilt when the providers change in Settings.
 */
export const auth = betterAuth(authOptions([]));

export type Auth = typeof auth;

/** The auth instance for /api/auth/*, with the providers configured now. */
let current: { key: string; checkedAt: number; auth: ReturnType<typeof buildRequestAuth> } | null = null;
/** How long a configuration is trusted before it's read again (a save in Settings resets it). */
const SSO_RECHECK_MS = 30_000;

function buildRequestAuth(sso: SsoConfig[]) {
  return betterAuth(authOptions(sso));
}

export async function getRequestAuth() {
  if (current && Date.now() - current.checkedAt < SSO_RECHECK_MS) return current.auth;
  const sso = await ssoConfigs();
  const key = JSON.stringify(sso);
  if (current?.key === key) current.checkedAt = Date.now();
  else current = { key, checkedAt: Date.now(), auth: buildRequestAuth(sso) };
  return current.auth;
}

/** Read the providers again on the next request (after a change in Settings). */
export function invalidateRequestAuth(): void {
  if (current) current.checkedAt = 0;
}

/**
 * Verify a user's password against their credential account — step-up re-auth
 * for crown-jewel actions (e.g. downloading the recovery file). Returns false
 * for OAuth-only accounts (no credential password to check).
 */
export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const account = await prisma.account.findFirst({ where: { userId, providerId: "credential" } });
  if (!account?.password) return false;
  const ctx = await auth.$context;
  return ctx.password.verify({ hash: account.password, password }).catch(() => false);
}
