"use client";

/** Presentation only: the weekly integrity-check toggle. Logic in ./index.tsx. */
export function IntegrityToggleView({ on, pending, onToggle }: { on: boolean; pending: boolean; onToggle: () => void }) {
  return (
    <label
      className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
      title="Run a deep integrity check (re-read the data) weekly for this destination"
    >
      <input type="checkbox" checked={on} disabled={pending} onChange={onToggle} className="h-3.5 w-3.5" />
      weekly check
    </label>
  );
}
