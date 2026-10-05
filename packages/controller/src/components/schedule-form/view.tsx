"use client";

import { Button, Input, Label, Select } from "@/components/ui";
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
  pending,
  error,
  onSubmit,
}: {
  destinations: Dest[];
  defaults?: Defaults;
  submitLabel: string;
  frequency: string;
  onFrequencyChange: (v: string) => void;
  pending: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useT();
  if (destinations.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("instances.scheduleForm.addDestinationFirst")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="frequency">{t("instances.scheduleForm.frequency")}</Label>
          <Select id="frequency" name="frequency" value={frequency} onChange={(e) => onFrequencyChange(e.target.value)}>
            <option value="hourly">{t("instances.scheduleForm.freqHourly")}</option>
            <option value="daily">{t("instances.scheduleForm.freqDaily")}</option>
            <option value="weekly">{t("instances.scheduleForm.freqWeekly")}</option>
            <option value="monthly">{t("instances.scheduleForm.freqMonthly")}</option>
            <option value="custom">{t("instances.scheduleForm.freqCustom")}</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mode">{t("instances.scheduleForm.mode")}</Label>
          <Select id="mode" name="mode" defaultValue={defaults?.mode ?? "backup"}>
            <option value="backup">{t("instances.scheduleForm.modeBackup")}</option>
            <option value="sync">{t("instances.scheduleForm.modeSync")}</option>
          </Select>
        </div>
      </div>

      {frequency === "custom" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customCron">{t("instances.scheduleForm.cronExpression")}</Label>
          <Input id="customCron" name="customCron" defaultValue={defaults?.customCron ?? "0 2 * * *"} className="font-mono" />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="destinationId">{t("instances.scheduleForm.destination")}</Label>
        <Select id="destinationId" name="destinationId" defaultValue={defaults?.destinationId} required>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Ret name="retentionDaily" label={t("instances.scheduleForm.keepDaily")} def={defaults?.retentionDaily ?? 7} />
        <Ret name="retentionWeekly" label={t("instances.scheduleForm.keepWeekly")} def={defaults?.retentionWeekly ?? 4} />
        <Ret name="retentionMonthly" label={t("instances.scheduleForm.keepMonthly")} def={defaults?.retentionMonthly ?? 6} />
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {pending ? t("common.saving") : submitLabel}
      </Button>
    </form>
  );
}

function Ret({ name, label, def }: { name: string; label: string; def: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" min={0} defaultValue={def} />
    </div>
  );
}
