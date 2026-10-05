"use client";

import { Select } from "@/components/ui";
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
  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground" title="Also copy every backup written here to a second destination">
      <Copy className="h-3.5 w-3.5" />
      mirror to
      <Select value={value} disabled={pending} onChange={(e) => onChange(e.target.value)} className="h-7 max-w-40 py-0 text-xs" aria-label="Mirror destination">
        <option value="">none</option>
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
