"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTrigger } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { ScheduleFormView, type Dest, type Defaults } from "./view";

export function ScheduleForm({
  action,
  destinations,
  defaults,
  submitLabel,
  onDone,
  onCancel,
}: {
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: string } | void>;
  destinations: Dest[];
  defaults?: Defaults;
  submitLabel?: string;
  /** After a successful save (e.g. close the panel holding the form). */
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const label = submitLabel ?? t("instances.scheduleForm.saveSchedule");
  const [frequency, setFrequency] = useState(defaults?.frequency ?? "daily");
  const [mode, setMode] = useState(defaults?.mode ?? "backup");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await action(fd);
      if (r && "error" in r && r.error) setError(r.error);
      else {
        toast.success(t("instances.scheduleForm.saved"));
        onDone?.();
      }
    });
  };

  return (
    <ScheduleFormView
      destinations={destinations}
      defaults={defaults}
      submitLabel={label}
      frequency={frequency}
      onFrequencyChange={setFrequency}
      mode={mode}
      onModeChange={setMode}
      pending={pending}
      error={error}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

/** "Edit"/"Set" button opening the schedule form in a side panel. */
export function ScheduleEditor({
  label,
  title,
  description,
  action,
  destinations,
  defaults,
  submitLabel,
  variant = "secondary",
}: {
  label: string;
  title: string;
  description?: string;
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: string } | void>;
  destinations: Dest[];
  defaults?: Defaults;
  submitLabel?: string;
  variant?: "secondary" | "primary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>
          <CalendarClock /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent side="right" title={title} description={description}>
        <ScheduleForm
          action={action}
          destinations={destinations}
          defaults={defaults}
          submitLabel={submitLabel}
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
