"use client";

import { Button, Input, Label } from "@/components/ui";

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
  return (
    <form action={onAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alertWebhookUrl">Webhook URL (Discord / Slack / custom)</Label>
        <Input
          id="alertWebhookUrl"
          name="alertWebhookUrl"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…  (leave blank to disable)"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" disabled={pending || !url} onClick={onTest}>
          Send test
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
