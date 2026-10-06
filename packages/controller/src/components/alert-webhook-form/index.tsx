"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAlertWebhook, testAlertWebhook } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { AlertWebhookFormView } from "./view";

export function AlertWebhookForm({ current }: { current: string }) {
  const t = useT();
  const [url, setUrl] = useState(current);
  const [saved, setSaved] = useState(current);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  const onAction = (fd: FormData) =>
    start(async () => {
      const r = await updateAlertWebhook(fd);
      if (r?.error) toast.error(r.error);
      else {
        setSaved(url);
        toast.success(t("settings.saved"));
      }
    });
  const onTest = () =>
    startTest(async () => {
      const r = await testAlertWebhook(url);
      if (r?.error) toast.error(r.error);
      else toast.success(r?.detail ?? t("settings.sent"));
    });

  return (
    <AlertWebhookFormView
      url={url}
      onUrlChange={setUrl}
      onAction={onAction}
      onTest={onTest}
      pending={pending}
      testing={testing}
      dirty={url !== saved}
    />
  );
}
