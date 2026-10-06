"use client";

import { useT } from "@/components/i18n-provider";
import { AuthShell } from "@/components/auth-shell";
import { TwoFactorSetup } from "@/components/two-factor/setup";
import { authClient } from "@/lib/auth-client";

/** The forced setup screen: the wizard, and a way out (sign out). */
export function RequiredSetup({ needsPassword }: { needsPassword: boolean }) {
  const t = useT();
  return (
    <AuthShell
      wide
      title={t("twofactor.setupTitle")}
      description={t("twofactor.setupRequired")}
      footer={
        <button
          type="button"
          className="font-medium text-accent hover:underline"
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/login";
          }}
        >
          {t("twofactor.signOut")}
        </button>
      }
    >
      <TwoFactorSetup needsPassword={needsPassword} onDone={() => (window.location.href = "/")} />
    </AuthShell>
  );
}
