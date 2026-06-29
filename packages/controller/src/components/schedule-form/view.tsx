"use client";

import { Button, Input, Label, Select } from "@/components/ui";

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
  if (destinations.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a destination first (Destinations page).</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="frequency">Frequency</Label>
          <Select id="frequency" name="frequency" value={frequency} onChange={(e) => onFrequencyChange(e.target.value)}>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily (02:00)</option>
            <option value="weekly">Weekly (Mon)</option>
            <option value="monthly">Monthly (1st)</option>
            <option value="custom">Custom cron…</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mode">Mode</Label>
          <Select id="mode" name="mode" defaultValue={defaults?.mode ?? "backup"}>
            <option value="backup">backup (versioned)</option>
            <option value="sync">sync (single copy)</option>
          </Select>
        </div>
      </div>

      {frequency === "custom" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customCron">Cron expression</Label>
          <Input id="customCron" name="customCron" defaultValue={defaults?.customCron ?? "0 2 * * *"} className="font-mono" />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="destinationId">Destination</Label>
        <Select id="destinationId" name="destinationId" defaultValue={defaults?.destinationId} required>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Ret name="retentionDaily" label="Keep daily" def={defaults?.retentionDaily ?? 7} />
        <Ret name="retentionWeekly" label="Keep weekly" def={defaults?.retentionWeekly ?? 4} />
        <Ret name="retentionMonthly" label="Keep monthly" def={defaults?.retentionMonthly ?? 6} />
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
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
