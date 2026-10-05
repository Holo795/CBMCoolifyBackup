"use client";

import { Button, Label, Select, Badge } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the self-backup config form. Logic in ./index.tsx. */
export function SelfBackupFormView({
  destinations,
  current,
  pending,
  runPending,
  verifyPending,
  msg,
  onSubmit,
  onRunNow,
  onVerify,
}: {
  destinations: { id: string; name: string; type: string }[];
  current: { enabled: boolean; destinationId: string; lastRunAt: string | null; lastStatus: string | null };
  pending: boolean;
  runPending: boolean;
  verifyPending: boolean;
  msg: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onRunNow: () => void;
  onVerify: () => void;
}) {
  const t = useT();
  const ok = current.lastStatus === "ok";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {destinations.length === 0 ? (
        <p className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">{t("settings.selfBackupNoDest")}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="selfBackupDest">{t("settings.selfBackupDestLabel")}</Label>
            <Select id="selfBackupDest" name="destinationId" defaultValue={current.destinationId} className="max-w-xs">
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.type})
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="enabled" defaultChecked={current.enabled} className="h-4 w-4" />
            {t("settings.selfBackupEnableLabel")}
          </label>
          {current.lastRunAt && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("settings.selfBackupLastRun")} <span className="text-foreground">{current.lastRunAt}</span>
              <Badge tone={ok ? "success" : "danger"}>{ok ? t("settings.statusOk") : t("settings.statusFailed")}</Badge>
              {!ok && current.lastStatus && <span className="text-[var(--color-danger)]">{current.lastStatus}</span>}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
            <Button type="button" variant="outline" disabled={runPending || !current.enabled} onClick={onRunNow} title={current.enabled ? t("settings.backupNowTitleEnabled") : t("settings.backupNowTitleDisabled")}>
              {runPending ? t("settings.backingUp") : t("settings.backupNow")}
            </Button>
            <Button type="button" variant="ghost" disabled={verifyPending || !current.enabled} onClick={onVerify} title={t("settings.verifyTitle")}>
              {verifyPending ? t("settings.verifying") : t("settings.verifyRecoveryPath")}
            </Button>
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          </div>
        </>
      )}
    </form>
  );
}
