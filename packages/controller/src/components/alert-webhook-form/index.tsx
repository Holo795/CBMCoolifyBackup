"use client";

import { useState, useTransition } from "react";
import { updateAlertWebhook, testAlertWebhook } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { AlertWebhookFormView } from "./view";

export function AlertWebhookForm({ current }: { current: string }) {
  const t = useT();
  const [url, setUrl] = useState(current);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const onAction = (fd: FormData) =>
    start(async () => {
      const r = await updateAlertWebhook(fd);
      setMsg(r?.error ?? t("settings.saved"));
    });
  const onTest = () =>
    start(async () => {
      const r = await testAlertWebhook(url);
      setMsg(r?.error ?? r?.detail ?? t("settings.sent"));
    });

  return <AlertWebhookFormView url={url} onUrlChange={setUrl} onAction={onAction} onTest={onTest} pending={pending} msg={msg} />;
}
