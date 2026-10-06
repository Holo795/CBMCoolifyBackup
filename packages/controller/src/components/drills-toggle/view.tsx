"use client";

import { SwitchRow } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the weekly restore-drill toggle. Logic in ./index.tsx. */
export function DrillsToggleView({ on, pending, onToggle }: { on: boolean; pending: boolean; onToggle: (v: boolean) => void }) {
  const t = useT();
  return (
    <SwitchRow
      id="drills-enabled"
      label={t("settings.drillsToggle")}
      description={t("settings.drillsToggleHint")}
      checked={on}
      onCheckedChange={onToggle}
      disabled={pending}
    />
  );
}
