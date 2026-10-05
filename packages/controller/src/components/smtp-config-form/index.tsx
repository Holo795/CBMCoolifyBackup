"use client";

import { useState, useTransition } from "react";
import { updateSmtp, testSmtp, setEmailVerification } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { SmtpConfigFormView, EmailVerificationToggleView, type SmtpCurrent } from "./view";

export type { SmtpCurrent };

export function SmtpConfigForm({ current }: { current: SmtpCurrent }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const onAction = (fd: FormData) =>
    start(async () => {
      const r = await updateSmtp(fd);
      setMsg(r?.error ?? t("settings.saved"));
    });
  const onTest = () =>
    start(async () => {
      const r = await testSmtp();
      setMsg(r?.error ?? r?.detail ?? t("settings.sent"));
    });

  return <SmtpConfigFormView current={current} pending={pending} msg={msg} onAction={onAction} onTest={onTest} />;
}

export function EmailVerificationToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onChange = (next: boolean) => {
    setOn(next);
    setError(null);
    start(async () => {
      const r = await setEmailVerification(next);
      if (r?.error) {
        setError(r.error);
        setOn(!next);
      }
    });
  };

  return <EmailVerificationToggleView on={on} pending={pending} error={error} onChange={onChange} />;
}
