"use client";

import { useRef, useState, useTransition } from "react";
import { ActionFormView } from "./view";
import { useT } from "@/components/i18n-provider";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type ActionResult = { ok?: boolean; error?: string; warning?: string } | void;

export function ActionForm({
  action,
  children,
  submitLabel,
  resetOnSuccess = true,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel?: string;
  resetOnSuccess?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setWarning(null);
    start(async () => {
      const r = await action(fd);
      if (r && "error" in r && r.error) setError(r.error);
      else {
        if (r && "warning" in r && r.warning) setWarning(r.warning);
        else toast.success(t("common.done"));
        if (resetOnSuccess) formRef.current?.reset();
        router.refresh();
      }
    });
  };

  return (
    <ActionFormView formRef={formRef} onSubmit={onSubmit} submitLabel={submitLabel ?? t("common.save")} pending={pending} error={error} warning={warning}>
      {children}
    </ActionFormView>
  );
}
