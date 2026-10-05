"use client";

import { useState, useTransition } from "react";
import { useT } from "@/components/i18n-provider";
import { ScheduleFormView, type Dest, type Defaults } from "./view";

export function ScheduleForm({
  action,
  destinations,
  defaults,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: string } | void>;
  destinations: Dest[];
  defaults?: Defaults;
  submitLabel?: string;
}) {
  const t = useT();
  const label = submitLabel ?? t("instances.scheduleForm.saveSchedule");
  const [frequency, setFrequency] = useState(defaults?.frequency ?? "daily");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await action(fd);
      if (r && "error" in r && r.error) setError(r.error);
    });
  };

  return (
    <ScheduleFormView
      destinations={destinations}
      defaults={defaults}
      submitLabel={label}
      frequency={frequency}
      onFrequencyChange={setFrequency}
      pending={pending}
      error={error}
      onSubmit={onSubmit}
    />
  );
}
