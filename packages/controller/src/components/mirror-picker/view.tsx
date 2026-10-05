"use client";

import { Select } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { Copy } from "lucide-react";

/** Presentation only: the mirror-target picker. Logic in ./index.tsx. */
export function MirrorPickerView({
  value,
  pending,
  msg,
  candidates,
  onChange,
}: {
  value: string;
  pending: boolean;
  msg: string | null;
  candidates: { id: string; name: string }[];
  onChange: (next: string) => void;
}) {
  const t = useT();
  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground" title={t("destinations.mirror.title")}>
      <Copy className="h-3.5 w-3.5" />
      {t("destinations.mirror.label")}
      <Select value={value} disabled={pending} onChange={(e) => onChange(e.target.value)} className="h-7 max-w-40 py-0 text-xs" aria-label={t("destinations.mirror.aria")}>
        <option value="">{t("common.none")}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {msg && <span className="text-[var(--color-danger)]">{msg}</span>}
    </label>
  );
}
