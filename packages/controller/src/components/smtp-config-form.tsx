"use client";

import { useState, useTransition } from "react";
import { updateSmtp, testSmtp, setEmailVerification } from "@/app/actions";
import { Button, Input, Label } from "@/components/ui";

export interface SmtpCurrent {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  from: string;
  fromName: string;
  hasPassword: boolean;
  envLocked: { host: boolean; port: boolean; secure: boolean; user: boolean; password: boolean; from: boolean; fromName: boolean };
}

export function SmtpConfigForm({ current }: { current: SmtpCurrent }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const env = current.envLocked;

  return (
    <form
      action={(fd) => start(async () => { const r = await updateSmtp(fd); setMsg(r?.error ?? "Saved ✓"); })}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="smtpHost">Host</Label>
          <Input id="smtpHost" name="smtpHost" defaultValue={current.host} disabled={env.host} placeholder="smtp.example.com" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtpPort">Port</Label>
          <Input id="smtpPort" name="smtpPort" type="number" defaultValue={current.port} disabled={env.port} placeholder="587" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="smtpSecure" defaultChecked={current.secure} disabled={env.secure} />
        Implicit TLS (secure connection, usually port 465)
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtpUser">Username</Label>
          <Input id="smtpUser" name="smtpUser" defaultValue={current.user} disabled={env.user} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtpPassword">Password</Label>
          <Input
            id="smtpPassword"
            name="smtpPassword"
            type="password"
            disabled={env.password}
            autoComplete="new-password"
            placeholder={env.password ? "(set by environment)" : current.hasPassword ? "•••••••• (unchanged)" : ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtpFrom">From address</Label>
          <Input id="smtpFrom" name="smtpFrom" type="email" defaultValue={current.from} disabled={env.from} placeholder="cbm@yourdomain.com" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtpFromName">From name (optional)</Label>
          <Input id="smtpFromName" name="smtpFromName" defaultValue={current.fromName} disabled={env.fromName} placeholder="CBM Backups" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => start(async () => { const r = await testSmtp(); setMsg(r?.error ?? r?.detail ?? "Sent"); })}
        >
          Send test email
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}

export function EmailVerificationToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        className="mt-0.5"
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          setError(null);
          start(async () => {
            const r = await setEmailVerification(next);
            if (r?.error) { setError(r.error); setOn(!next); }
          });
        }}
      />
      <span>
        <span className="font-medium">Require email verification</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          New users and email changes receive a verification link. Sign-in is never blocked - it&apos;s a soft reminder.
          Requires a working SMTP.
        </span>
        {error && <span className="mt-0.5 block text-xs text-[var(--color-danger)]">{error}</span>}
      </span>
    </label>
  );
}
