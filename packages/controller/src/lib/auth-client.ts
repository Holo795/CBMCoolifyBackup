"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    // A sign-in that needs a second factor goes to the code page.
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
  ],
});
export const { signIn, signOut, signUp, useSession, requestPasswordReset, resetPassword } = authClient;
