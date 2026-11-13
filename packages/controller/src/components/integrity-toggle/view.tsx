"use client";

import { useId } from "react";
import { FileCheck2 } from "lucide-react";
import { Select, Switch, Tooltip } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the weekly integrity-check switch. Logic in ./index.tsx. */
export function IntegrityToggleView({
  on,
  pending,
  onToggle,
  restic,
  weeks,
  onWeeks,
}: {
  on: boolean;
  pending: boolean;
  onToggle: () => void;
  restic: boolean;
  weeks: number;
  onWeeks: (w: number) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tooltip content={t(restic ? "destinations.integrityToggle.titleRestic" : "destinations.integrityToggle.title")}>
        <label htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted-foreground">
          <FileCheck2 className="size-3.5" /> {t(restic ? "destinations.integrityToggle.rowRestic" : "destinations.integrityToggle.row")}
        </label>
      </Tooltip>
      <Switch id={id} checked={on} disabled={pending} onCheckedChange={onToggle} />
      {restic && on && (
        <Select
          aria-label={t("destinations.integrityToggle.weeks")}
          value={String(weeks)}
          disabled={pending}
          onChange={(e) => onWeeks(Number(e.target.value))}
          className="h-7 w-auto py-0 text-xs"
        >
          {[1, 2, 4, 8, 12, 20].map((n) => (
            <option key={n} value={n}>
              {t(n === 1 ? "destinations.integrityToggle.weeksOne" : "destinations.integrityToggle.weeksMany", { n })}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
