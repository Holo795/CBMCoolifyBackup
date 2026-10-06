"use client";

import { useId } from "react";
import { FileCheck2 } from "lucide-react";
import { Switch, Tooltip } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the weekly integrity-check switch. Logic in ./index.tsx. */
export function IntegrityToggleView({ on, pending, onToggle }: { on: boolean; pending: boolean; onToggle: () => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Tooltip content={t("destinations.integrityToggle.title")}>
        <label htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted-foreground">
          <FileCheck2 className="size-3.5" /> {t("destinations.integrityToggle.row")}
        </label>
      </Tooltip>
      <Switch id={id} checked={on} disabled={pending} onCheckedChange={onToggle} />
    </div>
  );
}
