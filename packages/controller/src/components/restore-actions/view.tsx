"use client";

import { Button, Select } from "@/components/ui";
import { RotateCcw } from "lucide-react";

/** Presentation only: the restore / "→ new" buttons (+ optional target-instance
 * picker for cross-instance migration). Logic in ./index.tsx. */
export function RestoreActionsView({
  size,
  hasAgent,
  pending,
  busy,
  error,
  onRun,
  picker,
}: {
  size: "sm" | "md";
  hasAgent: boolean;
  pending: boolean;
  busy: "in_place" | "new_resource" | null;
  error: string | null;
  onRun: (target: "in_place" | "new_resource") => void;
  picker?: {
    open: boolean;
    instances: { id: string; name: string }[];
    targetId: string;
    onTargetChange: (id: string) => void;
    onGo: () => void;
    onClose: () => void;
  };
}) {
  const disabledTitle = hasAgent ? undefined : "No live agent for this instance - restore needs one";

  return (
    <span className="relative inline-flex items-center gap-1.5">
      <Button size={size} variant="outline" disabled={!hasAgent || pending} title={disabledTitle} onClick={() => onRun("in_place")}>
        <RotateCcw className="h-3.5 w-3.5" />
        {busy === "in_place" ? "Restoring…" : "Restore"}
      </Button>
      <Button
        size={size}
        variant="ghost"
        disabled={!hasAgent || pending}
        title={hasAgent ? "Clone to a new Coolify resource and restore into it" : disabledTitle}
        onClick={() => onRun("new_resource")}
      >
        {busy === "new_resource" ? "Cloning…" : "→ new"}
      </Button>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}

      {picker?.open && (
        <span className="absolute right-0 top-full z-20 mt-1.5 flex w-72 flex-col gap-2 rounded-lg border bg-card p-3 shadow-lg">
          <span className="text-xs font-medium">Restore onto</span>
          <Select value={picker.targetId} onChange={(e) => picker.onTargetChange(e.target.value)} aria-label="Target instance">
            {picker.instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted-foreground">Missing projects and environments are created on the target; a single-server target hosts everything.</span>
          <span className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={picker.onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={pending} onClick={picker.onGo}>
              {busy === "new_resource" ? "Cloning…" : "Restore → new"}
            </Button>
          </span>
        </span>
      )}
    </span>
  );
}
