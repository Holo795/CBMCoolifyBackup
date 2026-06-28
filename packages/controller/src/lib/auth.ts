import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "./prisma";
import { env } from "./env";
import { sendMail } from "./email";

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
        // The first person to register becomes the admin; registration is then
        // closed. Blocks every sign-up path (email + social) once a user exists.
        before: async (user) => {
          const count = await prisma.user.count();
          if (count > 0) {
            throw new APIError("FORBIDDEN", {
              message: "Registration is closed - an account already exists.",
            });
          }
          return { data: user };
        },
      },
    },
  },
});

export type Auth = typeof auth;
