"use client";

import { useState, useTransition } from "react";
import { updateAlertWebhook, testAlertWebhook } from "@/app/actions";
import { Button, Input, Label } from "@/components/ui";

export function AlertWebhookForm({ current }: { current: string }) {
  const [url, setUrl] = useState(current);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await updateAlertWebhook(fd);
          setMsg(r?.error ?? "Saved ✓");
        })
      }
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alertWebhookUrl">Webhook URL (Discord / Slack / custom)</Label>
        <Input
          id="alertWebhookUrl"
          name="alertWebhookUrl"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…  (leave blank to disable)"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !url}
          onClick={() =>
            start(async () => {
              const r = await testAlertWebhook(url);
              setMsg(r?.error ?? r?.detail ?? "Sent");
            })
          }
        >
          Send test
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
