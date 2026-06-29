"use client";

import { useState, useTransition } from "react";
import { updateAlertWebhook, testAlertWebhook } from "@/app/actions";
import { AlertWebhookFormView } from "./view";

export function AlertWebhookForm({ current }: { current: string }) {
  const [url, setUrl] = useState(current);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const onAction = (fd: FormData) =>
    start(async () => {
      const r = await updateAlertWebhook(fd);
      setMsg(r?.error ?? "Saved ✓");
    });
  const onTest = () =>
    start(async () => {
      const r = await testAlertWebhook(url);
      setMsg(r?.error ?? r?.detail ?? "Sent");
    });

  return <AlertWebhookFormView url={url} onUrlChange={setUrl} onAction={onAction} onTest={onTest} pending={pending} msg={msg} />;
}
