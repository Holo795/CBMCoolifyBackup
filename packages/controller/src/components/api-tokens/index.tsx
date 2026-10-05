"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { createApiToken } from "@/app/actions";
import { ApiTokensView, type ApiTokenRow } from "./view";

/**
 * Manage machine API tokens for the MCP server / external AI agents. Create is
 * reveal-once (the plaintext is shown here and never again); revoke is a typed
 * confirmation. Markup in ./view.tsx.
 */
export function ApiTokens({ tokens }: { tokens: ApiTokenRow[] }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("operator");
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onCreate = () => {
    setMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("role", role);
      const res = await createApiToken(fd);
      if (res.error || !res.token) {
        setMsg({ ok: false, text: res.error ?? t("apitokens.createFailed") });
        return;
      }
      setRevealed(res.token);
      setName("");
      router.refresh();
    });
  };

  return (
    <ApiTokensView
      tokens={tokens}
      name={name}
      role={role}
      pending={pending}
      revealed={revealed}
      msg={msg}
      onNameChange={setName}
      onRoleChange={setRole}
      onCreate={onCreate}
      onDismissReveal={() => setRevealed(null)}
    />
  );
}
