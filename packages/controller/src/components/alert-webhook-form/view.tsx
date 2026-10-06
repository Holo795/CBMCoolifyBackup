"use client";

import { Send } from "lucide-react";
import { Button, Input, Field } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the webhook form. Logic in ./index.tsx. */
export function AlertWebhookFormView({
  url,
  onUrlChange,
  onAction,
  onTest,
  pending,
  testing,
  dirty,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  onAction: (fd: FormData) => void;
  onTest: () => void;
  pending: boolean;
  testing: boolean;
  dirty: boolean;
}) {
  const t = useT();
  return (
    <form action={onAction} className="flex flex-col gap-4">
      <Field label={t("settings.alertWebhookLabel")} htmlFor="alertWebhookUrl">
        <Input
          id="alertWebhookUrl"
          name="alertWebhookUrl"
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder={t("settings.alertWebhookPlaceholder")}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" loading={testing} disabled={pending || !url} onClick={onTest}>
          <Send /> {t("settings.sendTest")}
        </Button>
        <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
