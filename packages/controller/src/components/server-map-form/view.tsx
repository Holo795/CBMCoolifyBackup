"use client";

import { Button, Input, Select } from "@/components/ui";
import { Plus, X } from "lucide-react";

export type MapRow = { source: string; target: string };

/** Presentation only: the source→target server mapping rows. Logic in ./index.tsx. */
export function ServerMapFormView({
  rows,
  servers,
  pending,
  msg,
  onRowChange,
  onAddRow,
  onRemoveRow,
  onSave,
}: {
  rows: MapRow[];
  servers: { uuid: string; name: string }[];
  pending: boolean;
  msg: string | null;
  onRowChange: (i: number, row: MapRow) => void;
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">When restoring a snapshot that ran on another server, land it on the mapped server below. Unmapped sources go to the first server.</p>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row.source}
            onChange={(e) => onRowChange(i, { ...row, source: e.target.value })}
            placeholder="source server uuid"
            className="max-w-56 font-mono text-xs"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Select
            value={row.target}
            onChange={(e) => onRowChange(i, { ...row, target: e.target.value })}
            className="max-w-48"
            aria-label="Target server"
          >
            {servers.map((s) => (
              <option key={s.uuid} value={s.uuid}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button size="icon" variant="ghost" onClick={() => onRemoveRow(i)} aria-label="Remove mapping">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onAddRow}>
          <Plus className="h-3.5 w-3.5" /> Add mapping
        </Button>
        <Button size="sm" variant="primary" disabled={pending} onClick={onSave}>
          {pending ? "Saving…" : "Save map"}
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
