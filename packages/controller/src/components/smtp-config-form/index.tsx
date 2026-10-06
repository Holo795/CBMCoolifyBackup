"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSmtp, testSmtp, setEmailVerification } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { SmtpConfigFormView, EmailVerificationToggleView, type SmtpCurrent } from "./view";

export type { SmtpCurrent };

export function SmtpConfigForm({ current }: { current: SmtpCurrent }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  const onAction = (fd: FormData) =>
    start(async () => {
      const r = await updateSmtp(fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(t("settings.saved"));
        router.refresh();
      }
    });
  const onTest = () =>
    startTest(async () => {
      const r = await testSmtp();
      if (r?.error) toast.error(r.error);
      else toast.success(r?.detail ?? t("settings.sent"));
    });

  return <SmtpConfigFormView current={current} pending={pending} testing={testing} onAction={onAction} onTest={onTest} />;
}

export function EmailVerificationToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  const onChange = (next: boolean) => {
    setOn(next);
    start(async () => {
      const r = await setEmailVerification(next);
      if (r?.error) {
        toast.error(r.error);
        setOn(!next);
      }
    });
  };

  return <EmailVerificationToggleView on={on} pending={pending} onChange={onChange} />;
}
