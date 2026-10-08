"use client";

import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui";
import { GithubIcon } from "@/components/icons/github";
import { GoogleIcon } from "@/components/icons/google";
import { GitlabIcon } from "@/components/icons/gitlab";
import { useT } from "@/components/i18n-provider";
import type { OAuthProvider } from "@/lib/auth";
import type { SsoButton } from "@/lib/sso";

const PROVIDER_ICON = { github: GithubIcon, google: GoogleIcon, gitlab: GitlabIcon, oidc: KeyRound };

/** "or" + one "Continue with …" button per configured single sign-on provider. */
export function OAuthButtons({ providers, onProvider }: { providers: SsoButton[]; onProvider: (p: OAuthProvider) => void }) {
  const t = useT();
  if (providers.length === 0) return null;
  return (
    <>
      <div className="flex items-center gap-3 text-xs text-subtle-foreground">
        <div className="h-px flex-1 bg-border" /> {t("auth.or")} <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-2">
        {providers.map((p) => {
          const Icon = PROVIDER_ICON[p.id];
          return (
            <Button key={p.id} type="button" onClick={() => onProvider(p.id)} className="w-full">
              <Icon className="size-4" /> {p.label ? t("auth.continueWithNamed", { name: p.label }) : t(`auth.continueWith.${p.id}`)}
            </Button>
          );
        })}
      </div>
    </>
  );
}
