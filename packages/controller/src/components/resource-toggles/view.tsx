"use client";

import { Check, Loader2 } from "lucide-react";

/** Presentation only: the per-resource backup switches. Logic in ./index.tsx. */
export function ResourceTogglesView({
  verbose,
  enabled,
  live,
  pending,
  saved,
  onEnabledChange,
  onLiveChange,
}: {
  verbose: boolean;
  enabled: boolean;
  live: boolean;
  pending: boolean;
  saved: boolean;
  onEnabledChange: (v: boolean) => void;
  onLiveChange: (v: boolean) => void;
}) {
  const status = pending ? (
    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  ) : saved ? (
    <Check className="h-3 w-3 text-[var(--color-success)]" />
  ) : null;

  if (verbose) {
    return (
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium">Include in scheduled backups</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              When enabled, this resource is backed up by its instance&apos;s schedule (or its own override).
              Unchecked, it&apos;s skipped by scheduled backups.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={live} onChange={(e) => onLiveChange(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium">Copy live, without freezing (at my own risk)</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Copies files without any freeze: zero downtime, but a file rewritten right as it&apos;s copied could be
              inconsistent. Avoid if the resource writes a lot outside its database.
            </span>
          </span>
        </label>
        <div className="h-4 text-xs text-muted-foreground">{status}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} /> on
      </label>
      <label
        className="flex items-center gap-1.5 text-xs"
        title="Copy files without freezing the containers (zero downtime, but a risk of inconsistency)"
      >
        <input type="checkbox" checked={live} onChange={(e) => onLiveChange(e.target.checked)} /> live
      </label>
      <span className="flex h-3 w-3 items-center justify-center">{status}</span>
    </div>
  );
}
