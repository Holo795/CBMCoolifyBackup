"use client";

import { useId } from "react";
import { Copy } from "lucide-react";
import { Select, Tooltip } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the mirror-target picker. Logic in ./index.tsx. */
export function MirrorPickerView({
  value,
  pending,
  candidates,
  onChange,
}: {
  value: string;
  pending: boolean;
  candidates: { id: string; name: string }[];
  onChange: (next: string) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Tooltip content={t("destinations.mirror.title")}>
        <label htmlFor={id} className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <Copy className="size-3.5" /> {t("destinations.mirror.row")}
        </label>
      </Tooltip>
      <Select id={id} value={value} disabled={pending} onChange={(e) => onChange(e.target.value)} className="w-40 [&_select]:h-8 [&_select]:text-[13px]">
        <option value="">{t("common.none")}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
