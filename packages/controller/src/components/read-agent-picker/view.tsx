"use client";

import { useId } from "react";
import { Cpu } from "lucide-react";
import { Select, Tooltip } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the reading-agent picker. Logic in ./index.tsx. */
export function ReadAgentPickerView({
  value,
  pending,
  agents,
  onChange,
}: {
  value: string;
  pending: boolean;
  agents: { id: string; hostname: string }[];
  onChange: (next: string) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Tooltip content={t("destinations.readAgent.title")}>
        <label htmlFor={id} className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <Cpu className="size-3.5" /> {t("destinations.readAgent.row")}
        </label>
      </Tooltip>
      <Select id={id} value={value} disabled={pending} onChange={(e) => onChange(e.target.value)} className="w-40 [&_select]:h-8 [&_select]:text-[13px]">
        <option value="">{t("destinations.readAgent.default")}</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.hostname}
          </option>
        ))}
      </Select>
    </div>
  );
}
