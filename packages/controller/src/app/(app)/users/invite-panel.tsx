"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Input, OptionCards, SwitchRow } from "@/components/ui";
import { Copy, Check, AlertTriangle, UserPlus } from "lucide-react";
import { createInvitation } from "@/app/actions";
import { ROLES } from "@/lib/roles";
import { useT } from "@/components/i18n-provider";

export type PendingInvite = { id: string; email: string; role: string; expires: string };

/** Admin-only: "Invite" button opening a panel that creates an invite link (optionally emailed). */
export function InviteButton({ canEmail }: { canEmail: boolean }) {
  const t = useT();
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState("viewer");
  const [sendEmail, setSendEmail] = useState(false);
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("role", role);
    if (sendEmail) fd.set("sendEmail", "on");
    start(async () => {
      const r = await createInvitation(fd);
      if (r.error || !r.link) {
        setError(r.error ?? t("users.invite.createError"));
        return;
      }
      setResult({ link: r.link, emailed: !!r.emailed });
      toast.success(t("users.invite.created"));
      router.refresh();
    });
  }

  const onCopy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      setError(null);
      setResult(null);
      setRole("viewer");
      setSendEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <UserPlus /> {t("users.invite.button")}
        </Button>
      </DialogTrigger>
      <DialogContent
        side="right"
        title={t("users.invite.title")}
        description={t("users.invite.description")}
        footer={
          result ? (
            <DialogClose asChild>
              <Button variant="primary">{t("users.invite.done")}</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button>{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" form={formId} variant="primary" loading={pending}>
                {t("users.invite.createLink")}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                {t("users.invite.copyNowBefore")}
                <b>{t("users.invite.once")}</b>
                {t("users.invite.copyNowAfter")}
                {result.emailed ? t("users.invite.alsoEmailed") : ""}
                {t("users.invite.validity")}
              </span>
            </div>
            <div className="flex items-stretch gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border bg-surface px-3 py-2 font-mono text-xs leading-relaxed">
                {result.link}
              </code>
              <Button size="icon" onClick={() => onCopy(result.link)} aria-label={t("users.invite.copyAria")}>
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
          </div>
        ) : (
          <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5">
            <Field label={t("users.email")} htmlFor="invite-email">
              <Input id="invite-email" name="email" type="email" placeholder={t("users.invite.emailPlaceholder")} required />
            </Field>
            <Field label={t("users.role")}>
              <OptionCards
                name="role-choice"
                label={t("users.role")}
                value={role}
                onChange={setRole}
                columns={1}
                options={ROLES.map((r) => ({ value: r, title: t(`users.roles.${r}`), hint: t(`users.roleHints.${r}`) }))}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <SwitchRow
                id="invite-send"
                label={t("users.invite.emailLink")}
                checked={sendEmail}
                onCheckedChange={setSendEmail}
                disabled={!canEmail}
              />
              {!canEmail && (
                <p className="text-xs text-muted-foreground">
                  {t("users.invite.smtpBefore")}
                  <a href="/settings#email" className="font-medium text-accent hover:underline">
                    {t("users.invite.settingsLink")}
                  </a>
                  {t("users.invite.smtpAfter")}
                </p>
              )}
            </div>
            {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
