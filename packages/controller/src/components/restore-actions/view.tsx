"use client";

import { Button } from "@/components/ui";
import { RotateCcw } from "lucide-react";

/** Presentation only: the restore / "→ new" buttons. Logic in ./index.tsx. */
export function RestoreActionsView({
  size,
  hasAgent,
  pending,
  busy,
  error,
  onRun,
}: {
  size: "sm" | "md";
  hasAgent: boolean;
  pending: boolean;
  busy: "in_place" | "new_resource" | null;
  error: string | null;
  onRun: (target: "in_place" | "new_resource") => void;
}) {
  const disabledTitle = hasAgent ? undefined : "No live agent for this instance - restore needs one";

  return (
    <span className="inline-flex items-center gap-1.5">
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
    </span>
  );
}
