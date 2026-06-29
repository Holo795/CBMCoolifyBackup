"use client";

import { Button, Input, Label } from "@/components/ui";

export type HookRow = { container: string; pre: string; post: string };

/** Presentation only: per-container hook rows. Logic in ./index.tsx. */
export function HooksFormView({
  rows,
  multi,
  containersEmpty,
  pending,
  saved,
  onUpdate,
  onSubmit,
}: {
  rows: HookRow[];
  multi: boolean;
  containersEmpty: boolean;
  pending: boolean;
  saved: boolean;
  onUpdate: (i: number, field: "pre" | "post", val: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {rows.map((r, i) => (
        <div key={r.container || "primary"} className="flex flex-col gap-2">
          {multi && (
            <div className="font-mono text-xs font-medium text-foreground">{r.container || "primary container"}</div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`pre-${i}`}>Pre-backup</Label>
              <Input
                id={`pre-${i}`}
                value={r.pre}
                onChange={(e) => onUpdate(i, "pre", e.target.value)}
                placeholder="php artisan down"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`post-${i}`}>Post-backup</Label>
              <Input
                id={`post-${i}`}
                value={r.post}
                onChange={(e) => onUpdate(i, "post", e.target.value)}
                placeholder="php artisan up"
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Run inside {multi ? "each named container" : "the resource's primary container"}. A failing pre-command aborts
        the backup; the post-command always runs. Leave blank to disable.
        {containersEmpty && " (Containers are detected after the first backup - for now this targets the primary container.)"}
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save hooks"}
        </Button>
        {saved && <span className="text-xs text-[var(--color-success)]">Saved ✓</span>}
      </div>
    </form>
  );
}
