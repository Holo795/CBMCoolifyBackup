"use client";

import { Button, Input, Label } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the webhook form. Logic in ./index.tsx. */
export function AlertWebhookFormView({
  url,
  onUrlChange,
  onAction,
  onTest,
  pending,
  msg,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  onAction: (fd: FormData) => void;
  onTest: () => void;
  pending: boolean;
  msg: string | null;
}) {
  const t = useT();
  return (
    <form action={onAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alertWebhookUrl">{t("settings.alertWebhookLabel")}</Label>
        <Input
          id="alertWebhookUrl"
          name="alertWebhookUrl"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder={t("settings.alertWebhookPlaceholder")}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="outline" disabled={pending || !url} onClick={onTest}>
          {t("settings.sendTest")}
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
