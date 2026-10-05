"use client";

import { useState } from "react";
import { Button, Input, Label, Select, Badge } from "@/components/ui";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { useT } from "@/components/i18n-provider";
import { revokeApiToken } from "@/app/actions";
import { KeyRound, Copy, Check } from "lucide-react";

export type ApiTokenRow = {
  id: string;
  name: string;
  role: string;
  tokenHint: string;
  lastUsedAt: string | null;
  createdAt: string | null;
};

const ROLES = ["viewer", "operator", "admin"] as const;

/** Presentation only: the API-tokens card body. Logic in ./index.tsx. */
export function ApiTokensView({
  tokens,
  name,
  role,
  pending,
  revealed,
  msg,
  onNameChange,
  onRoleChange,
  onCreate,
  onDismissReveal,
}: {
  tokens: ApiTokenRow[];
  name: string;
  role: string;
  pending: boolean;
  revealed: string | null;
  msg: { ok: boolean; text: string } | null;
  onNameChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onCreate: () => void;
  onDismissReveal: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; the value is visible to copy by hand */
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Reveal-once box */}
      {revealed && (
        <div className="rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-3">
          <p className="mb-2 text-xs font-medium text-[var(--color-success)]">{t("apitokens.revealWarning")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{revealed}</code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="ml-1">{copied ? t("apitokens.copied") : t("apitokens.copy")}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDismissReveal}>
              {t("apitokens.dismiss")}
            </Button>
          </div>
        </div>
      )}

      {/* Existing tokens */}
      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("apitokens.none")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tokens.map((tok) => (
            <li key={tok.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{tok.name}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{tok.tokenHint}</span>
                <span className="block text-xs text-muted-foreground">
                  {tok.lastUsedAt ? t("apitokens.lastUsed", { when: tok.lastUsedAt }) : t("apitokens.never")}
                </span>
              </span>
              <Badge tone={tok.role === "admin" ? "danger" : tok.role === "operator" ? "accent" : "neutral"}>
                {t(`apitokens.role.${tok.role}`)}
              </Badge>
              <ConfirmDeleteButton
                action={() => revokeApiToken(tok.id)}
                confirmWord={tok.name}
                title={t("apitokens.revokeTitle")}
                body={t("apitokens.revokeBody", { name: tok.name })}
                label={t("apitokens.revoke")}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Create */}
      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apitoken-name">{t("apitokens.nameLabel")}</Label>
          <Input
            id="apitoken-name"
            value={name}
            placeholder={t("apitokens.namePlaceholder")}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apitoken-role">{t("apitokens.roleLabel")}</Label>
          <Select id="apitoken-role" value={role} onChange={(e) => onRoleChange(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`apitokens.role.${r}`)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{t(`apitokens.roleDesc.${role}`)}</p>
        </div>
        {msg && (
          <p className={`text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>{msg.text}</p>
        )}
        <div>
          <Button type="button" variant="primary" size="sm" disabled={pending || !name.trim()} onClick={onCreate}>
            {pending ? t("apitokens.creating") : t("apitokens.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}
