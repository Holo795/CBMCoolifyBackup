"use client";

import { useState } from "react";
import { KeyRound, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { GithubIcon } from "@/components/icons/github";
import { GoogleIcon } from "@/components/icons/google";
import { GitlabIcon } from "@/components/icons/gitlab";
import { useT } from "@/components/i18n-provider";
import { authClient } from "@/lib/auth-client";
import type { SsoButton } from "@/lib/sso";

const ICON = { github: GithubIcon, google: GoogleIcon, gitlab: GitlabIcon, oidc: KeyRound };

/** Profile: the configured single sign-on providers, linked or to link (signed in). */
export function SsoLinks({ providers, linked }: { providers: SsoButton[]; linked: string[] }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {providers.map((p) => {
        const Icon = ICON[p.id];
        const name = p.label ?? t(`profile.sso.provider.${p.id}`);
        const isLinked = linked.includes(p.id);
        return (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2">
              <Icon className="size-4" /> {name}
            </span>
            {isLinked ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Check className="size-3.5" /> {t("profile.sso.linked")}
              </span>
            ) : (
              <Button
                size="sm"
                loading={busy === p.id}
                onClick={async () => {
                  setBusy(p.id);
                  setError(null);
                  const res = await authClient.linkSocial({ provider: p.id, callbackURL: "/profile", errorCallbackURL: "/profile" });
                  if (res?.error) {
                    setError(res.error.message ?? t("profile.sso.failed"));
                    setBusy(null);
                  }
                }}
              >
                {t("profile.sso.link")}
              </Button>
            )}
          </div>
        );
      })}
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
