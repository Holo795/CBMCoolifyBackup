"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSelfBackup, runSelfBackupNow, verifyRecoveryPath } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { SelfBackupFormView } from "./view";

type Result = { error?: string; detail?: string } | void | undefined;

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

  const report = (r: Result, fallback: string, refresh = true) => {
    if (r?.error) toast.error(r.error);
    else {
      toast.success(r?.detail ?? fallback);
      if (refresh) router.refresh();
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => report(await updateSelfBackup(fd), t("settings.savedPlain")));
  };
  const onRunNow = () => startRun(async () => report(await runSelfBackupNow(), t("settings.done")));
  const onVerify = () => startVerify(async () => report(await verifyRecoveryPath(), t("settings.verified"), false));

  return (
    <SelfBackupFormView
      destinations={destinations}
      current={current}
      pending={pending}
      runPending={runPending}
      verifyPending={verifyPending}
      onSubmit={onSubmit}
      onRunNow={onRunNow}
      onVerify={onVerify}
    />
  );
}
