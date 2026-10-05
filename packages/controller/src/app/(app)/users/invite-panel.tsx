"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Badge } from "@/components/ui";
import { Copy, Check, Mail, AlertTriangle, Trash2 } from "lucide-react";
import { createInvitation, revokeInvitation } from "@/app/actions";
import { ROLES } from "@/lib/roles";
import { useT } from "@/components/i18n-provider";

export type PendingInvite = { id: string; email: string; role: string; expires: string };

/** Admin-only: create an invite (link, optionally emailed) and manage pending ones. */
export function InvitePanel({ canEmail, invites }: { canEmail: boolean; invites: PendingInvite[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const r = await createInvitation(fd);
      if (r.error || !r.link) {
        setError(r.error ?? t("users.invite.createError"));
        return;
      }
      setResult({ link: r.link, emailed: !!r.emailed });
      form.reset();
      router.refresh();
    });
  }

  const onCopy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  const onRevoke = (id: string) =>
    start(async () => {
      await revokeInvitation(id);
      router.refresh();
    });

  return (
    <Card className="h-fit min-w-0">
      <CardHeader>
        <CardTitle>{t("users.invite.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">{t("users.email")}</Label>
            <Input id="invite-email" name="email" type="email" placeholder={t("users.invite.emailPlaceholder")} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">{t("users.role")}</Label>
            <Select id="invite-role" name="role" defaultValue="viewer">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`users.roles.${r}`)}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="sendEmail" disabled={!canEmail} className="h-4 w-4" />
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" /> {t("users.invite.emailLink")}
            </span>
          </label>
          {!canEmail && (
            <p className="text-xs text-muted-foreground">{t("users.invite.smtpBefore")}<a href="/settings#email" className="underline">{t("users.invite.settingsLink")}</a>{t("users.invite.smtpAfter")}</p>
          )}
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "…" : t("users.invite.createLink")}
          </Button>
        </form>

        {result && (
          <div className="flex w-full flex-col gap-2">
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2.5 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
              <span>{t("users.invite.copyNowBefore")}<b>{t("users.invite.once")}</b>{t("users.invite.copyNowAfter")}{result.emailed ? t("users.invite.alsoEmailed") : ""}{t("users.invite.validity")}</span>
            </div>
            <div className="flex items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed">{result.link}</pre>
              <Button size="sm" variant="outline" onClick={() => onCopy(result.link)} aria-label={t("users.invite.copyAria")}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}

        {invites.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">{t("users.invite.pending")}</h3>
            <div className="flex flex-col divide-y rounded-md border">
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="block truncate font-medium">{i.email}</span>
                    <span className="text-xs text-muted-foreground">{t("users.invite.expires", { date: i.expires })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={i.role === "admin" ? "accent" : "neutral"}>{t(`users.roles.${i.role}`)}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRevoke(i.id)}
                      disabled={pending}
                      aria-label={t("users.invite.revokeAria")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
