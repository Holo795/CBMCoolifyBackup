"use client";

import { useT } from "@/components/i18n-provider";

/** Presentation only: the weekly restore-drill toggle. Logic in ./index.tsx. */
export function DrillsToggleView({ on, pending, onToggle }: { on: boolean; pending: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" checked={on} disabled={pending} onChange={onToggle} className="mt-0.5 h-4 w-4" />
      <span>
        <span className="font-medium">{t("settings.drillsToggle")}</span>
        <span className="block text-xs text-muted-foreground">{t("settings.drillsToggleHint")}</span>
      </span>
    </label>
  );
}
