"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSelfBackup, runSelfBackupNow, verifyRecoveryPath } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { SelfBackupFormView } from "./view";

/**
 * Disaster-recovery self-backup config: pick a (non-local) destination and
 * enable the always-current metadata backup. Markup in ./view.tsx.
 */
export function SelfBackupForm({
  destinations,
  current,
}: {
  /** Non-"local" destinations only (local dies with the machine). */
  destinations: { id: string; name: string; type: string }[];
  current: { enabled: boolean; destinationId: string; lastRunAt: string | null; lastStatus: string | null };
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [runPending, startRun] = useTransition();
  const [verifyPending, startVerify] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 8000);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateSelfBackup(fd);
      flash(r?.error ?? r?.detail ?? t("settings.savedPlain"));
      if (!r?.error) router.refresh();
    });
  };

  const onRunNow = () =>
    startRun(async () => {
      const r = await runSelfBackupNow();
      flash(r?.error ?? r?.detail ?? t("settings.done"));
      if (!r?.error) router.refresh();
    });

  const onVerify = () =>
    startVerify(async () => {
      const r = await verifyRecoveryPath();
      flash(r?.error ?? r?.detail ?? t("settings.verified"));
    });

  return (
    <SelfBackupFormView
      destinations={destinations}
      current={current}
      pending={pending}
      runPending={runPending}
      verifyPending={verifyPending}
      msg={msg}
      onSubmit={onSubmit}
      onRunNow={onRunNow}
      onVerify={onVerify}
    />
  );
}
