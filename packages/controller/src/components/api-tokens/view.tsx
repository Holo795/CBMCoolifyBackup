"use client";

import { useState } from "react";
import { Button, Input, Field, OptionCards, Badge, List, ListItem } from "@/components/ui";
import { ActionsMenu } from "@/components/actions-menu";
import { useT } from "@/components/i18n-provider";
import { revokeApiToken } from "@/app/actions";
import { KeyRound, Copy, Check, AlertTriangle, Trash2 } from "lucide-react";

export type ApiTokenRow = {
  id: string;
  name: string;
  role: string;
  tokenHint: string;
  lastUsedAt: string | null;
  createdAt: string | null;
};

const ROLES = ["viewer", "operator", "admin"] as const;

/** Presentation only: the API-token list. Logic in ./index.tsx. */
export function ApiTokensView({ tokens }: { tokens: ApiTokenRow[] }) {
  const t = useT();
  if (tokens.length === 0) return <p className="text-[13px] text-muted-foreground">{t("apitokens.none")}</p>;
  return (
    <List className="shadow-none">
      {tokens.map((tok) => (
        <ListItem key={tok.id}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-medium">
              {tok.name}
              <span className="font-mono text-xs font-normal text-subtle-foreground">{tok.tokenHint}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {tok.lastUsedAt ? t("apitokens.lastUsed", { when: tok.lastUsedAt }) : t("apitokens.never")}
            </p>
          </div>
          <Badge tone={tok.role === "admin" ? "danger" : tok.role === "operator" ? "accent" : "neutral"}>{t(`apitokens.role.${tok.role}`)}</Badge>
          <ActionsMenu
            items={[
              {
                kind: "delete",
                label: t("apitokens.revoke"),
                icon: <Trash2 />,
                action: () => revokeApiToken(tok.id),
                confirmWord: tok.name,
                title: t("apitokens.revokeTitle"),
                body: t("apitokens.revokeBody", { name: tok.name }),
                confirmLabel: t("apitokens.revoke"),
                doneMsg: t("apitokens.revoked"),
              },
            ]}
          />
        </ListItem>
      ))}
    </List>
  );
}

/** Presentation only: the create-token form (inside the dialog). */
export function ApiTokenFormView({
  formId,
  name,
  role,
  error,
  onNameChange,
  onRoleChange,
  onSubmit,
}: {
  formId: string;
  name: string;
  role: string;
  error: string | null;
  onNameChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useT();
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label={t("apitokens.nameLabel")} htmlFor="apitoken-name">
        <Input id="apitoken-name" value={name} placeholder={t("apitokens.namePlaceholder")} onChange={(e) => onNameChange(e.target.value)} required />
      </Field>
      <Field label={t("apitokens.roleLabel")}>
        <OptionCards
          name="apitoken-role"
          label={t("apitokens.roleLabel")}
          value={role}
          onChange={onRoleChange}
          columns={1}
          options={ROLES.map((r) => ({ value: r, title: t(`apitokens.role.${r}`), hint: t(`apitokens.roleDesc.${r}`) }))}
        />
      </Field>
      {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
    </form>
  );
}

/** Presentation only: the reveal-once token box. */
export function ApiTokenRevealView({ token }: { token: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; the value is visible to copy by hand */
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>{t("apitokens.revealWarning")}</span>
      </div>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border bg-surface px-3 py-2 font-mono text-xs leading-relaxed">{token}</code>
        <Button size="icon" onClick={copy} aria-label={copied ? t("apitokens.copied") : t("apitokens.copy")}>
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}
