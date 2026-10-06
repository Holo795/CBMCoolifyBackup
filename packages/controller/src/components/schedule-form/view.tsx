"use client";

import { History, RefreshCw } from "lucide-react";
import { Button, Field, Input, OptionCards, Segmented, Select } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

export type Dest = { id: string; name: string };
export type Defaults = {
  frequency?: string;
  customCron?: string;
  destinationId?: string;
  mode?: string;
  retentionDaily?: number;
  retentionWeekly?: number;
  retentionMonthly?: number;
};

/** Presentation only: the schedule form. Logic in ./index.tsx. */
export function ScheduleFormView({
  destinations,
  defaults,
  submitLabel,
  frequency,
  onFrequencyChange,
  mode,
  onModeChange,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  destinations: Dest[];
  defaults?: Defaults;
  submitLabel: string;
  frequency: string;
  onFrequencyChange: (v: string) => void;
  mode: string;
  onModeChange: (v: string) => void;
  pending: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  if (destinations.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("instances.scheduleForm.addDestinationFirst")}</p>;
  }
  const k = (s: string) => t(`instances.scheduleForm.${s}`);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label={k("frequency")} hint={frequency === "custom" ? undefined : k("freqHint")}>
        <Segmented
          name="frequency"
          label={k("frequency")}
          value={frequency}
          onChange={onFrequencyChange}
          options={[
            { value: "hourly", label: k("freqHourlyShort") },
            { value: "daily", label: k("freqDailyShort") },
            { value: "weekly", label: k("freqWeeklyShort") },
            { value: "monthly", label: k("freqMonthlyShort") },
            { value: "custom", label: k("freqCustomShort") },
          ]}
        />
      </Field>

      {frequency === "custom" && (
        <Field label={k("cronExpression")} htmlFor="customCron">
          <Input id="customCron" name="customCron" defaultValue={defaults?.customCron ?? "0 2 * * *"} className="max-w-xs font-mono" />
        </Field>
      )}

      <Field label={k("mode")}>
        <OptionCards
          name="mode"
          columns={2}
          label={k("mode")}
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "backup", title: k("modeBackupTitle"), hint: k("modeBackupHint"), icon: <History /> },
            { value: "sync", title: k("modeSyncTitle"), hint: k("modeSyncHint"), icon: <RefreshCw /> },
          ]}
        />
      </Field>

      <Field label={k("destination")} htmlFor="destinationId">
        <Select id="destinationId" name="destinationId" defaultValue={defaults?.destinationId} required className="max-w-sm">
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>

      {mode === "backup" && (
        <Field label={k("retention")} hint={k("retentionHint")}>
          <div className="grid max-w-md grid-cols-3 gap-2">
            <Ret name="retentionDaily" unit={k("days")} label={k("keepDaily")} def={defaults?.retentionDaily ?? 7} />
            <Ret name="retentionWeekly" unit={k("weeks")} label={k("keepWeekly")} def={defaults?.retentionWeekly ?? 4} />
            <Ret name="retentionMonthly" unit={k("months")} label={k("keepMonthly")} def={defaults?.retentionMonthly ?? 6} />
          </div>
        </Field>
      )}

      {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}

function Ret({ name, label, unit, def }: { name: string; label: string; unit: string; def: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="relative">
        <Input name={name} type="number" min={0} defaultValue={def} aria-label={label} className="pr-16 tabular" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}
