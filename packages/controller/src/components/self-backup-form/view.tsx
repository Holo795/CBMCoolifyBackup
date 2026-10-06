"use client";

import { Play, ShieldCheck } from "lucide-react";
import { Button, Field, Select, SwitchRow, StatusDot, Tooltip } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the self-backup config form. Logic in ./index.tsx. */
export function SelfBackupFormView({
  destinations,
  current,
  pending,
  runPending,
  verifyPending,
  onSubmit,
  onRunNow,
  onVerify,
}: {
  destinations: { id: string; name: string; type: string }[];
  current: { enabled: boolean; destinationId: string; lastRunAt: string | null; lastStatus: string | null };
  pending: boolean;
  runPending: boolean;
  verifyPending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onRunNow: () => void;
  onVerify: () => void;
}) {
  const t = useT();
  const ok = current.lastStatus === "ok";

  if (destinations.length === 0)
    return (
      <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{t("settings.selfBackupNoDest")}</p>
    );

  const disabledHint = current.enabled ? undefined : t("settings.backupNowTitleDisabled");
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <SwitchRow id="selfBackupEnabled" name="enabled" label={t("settings.selfBackupEnableLabel")} defaultChecked={current.enabled} />
      <Field label={t("settings.selfBackupDestLabel")} htmlFor="selfBackupDest">
        <Select id="selfBackupDest" name="destinationId" defaultValue={current.destinationId} className="sm:max-w-xs">
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.type})
            </option>
          ))}
        </Select>
      </Field>
      {current.lastRunAt && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <StatusDot tone={ok ? "success" : "danger"} />
          {t("settings.selfBackupLastRun")} <span className="text-foreground">{current.lastRunAt}</span>
          <span className={ok ? "text-success" : "text-danger"}>· {ok ? t("settings.statusOk") : t("settings.statusFailed")}</span>
          {!ok && current.lastStatus && <span className="w-full text-xs text-danger">{current.lastStatus}</span>}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Tooltip content={disabledHint ?? t("settings.verifyTitle")}>
          <span tabIndex={current.enabled ? -1 : 0}>
            <Button type="button" variant="ghost" loading={verifyPending} disabled={!current.enabled} onClick={onVerify}>
              <ShieldCheck /> {t("settings.verifyRecoveryPath")}
            </Button>
          </span>
        </Tooltip>
        <Tooltip content={disabledHint ?? t("settings.backupNowTitleEnabled")}>
          <span tabIndex={current.enabled ? -1 : 0}>
            <Button type="button" loading={runPending} disabled={!current.enabled} onClick={onRunNow}>
              <Play /> {t("settings.backupNow")}
            </Button>
          </span>
        </Tooltip>
        <Button type="submit" variant="primary" loading={pending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
