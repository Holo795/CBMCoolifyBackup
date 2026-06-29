import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "./prisma";
import { env } from "./env";
import { sendMail } from "./email";
import { decideInviteSignup } from "./invitations";

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (env.oauth.githubClientId && env.oauth.githubClientSecret) {
  socialProviders.github = {
    clientId: env.oauth.githubClientId,
    clientSecret: env.oauth.githubClientSecret,
  };
}
if (env.oauth.googleClientId && env.oauth.googleClientSecret) {
  socialProviders.google = {
    clientId: env.oauth.googleClientId,
    clientSecret: env.oauth.googleClientSecret,
  };
}
if (env.oauth.gitlabClientId && env.oauth.gitlabClientSecret) {
  socialProviders.gitlab = {
    clientId: env.oauth.gitlabClientId,
    clientSecret: env.oauth.gitlabClientSecret,
  };
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.authSecret,
  baseURL: env.authUrl,
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
      // self-assigning a role.
      role: { type: "string", required: false, input: false, defaultValue: "admin" },
    },
    changeEmail: {
      enabled: true,
      // Sent to the CURRENT address to approve a change (only when the current
      // email is verified; an unverified email changes directly).
      sendChangeEmailVerification: async ({
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
  trustedOrigins: [env.authUrl, "http://localhost:3000"],
  databaseHooks: {
    user: {
      create: {
        // The first person to register becomes the admin; afterwards self-signup
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
              message: "Registration is closed - ask an admin for an invite link.",
            });
          }
          return { data: decision.role ? { ...user, role: decision.role } : user };
        },
        // Consume the invite that authorized this signup (single use).
        after: async (user) => {
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
});

export type Auth = typeof auth;
