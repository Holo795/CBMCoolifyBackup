"use client";

import { useT } from "@/components/i18n-provider";

/** Presentation only: the weekly integrity-check toggle. Logic in ./index.tsx. */
export function IntegrityToggleView({ on, pending, onToggle }: { on: boolean; pending: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <label
      className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
      title={t("destinations.integrityToggle.title")}
    >
      <input type="checkbox" checked={on} disabled={pending} onChange={onToggle} className="h-3.5 w-3.5" />
      {t("destinations.integrityToggle.label")}
    </label>
  );
}
