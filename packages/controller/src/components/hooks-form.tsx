"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label } from "./ui";
import { updateResourceHooks } from "@/app/actions";

/**
 * Per-resource pre/post-backup hook commands, run inside the primary container.
 * A failing pre hook aborts the backup; the post hook always runs afterwards.
 */
export function HooksForm({
  resourceId,
  pre,
  post,
}: {
  resourceId: string;
  pre: string | null;
  post: string | null;
}) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setSaved(false);
        start(async () => {
          await updateResourceHooks(resourceId, fd);
          setSaved(true);
        });
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preBackupHook">Pre-backup command</Label>
        <Input
          id="preBackupHook"
          name="preBackupHook"
          defaultValue={pre ?? ""}
          placeholder="php artisan down"
          className="font-mono text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="postBackupHook">Post-backup command</Label>
        <Input
          id="postBackupHook"
          name="postBackupHook"
          defaultValue={post ?? ""}
          placeholder="php artisan up"
          className="font-mono text-xs"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Run inside the resource&apos;s primary container. A failing pre-command aborts the backup; the post-command
        always runs (even on failure). Leave blank to disable.
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
