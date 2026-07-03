"use client";

import { Button, Label, Select, Badge } from "@/components/ui";

/** Presentation only: the self-backup config form. Logic in ./index.tsx. */
export function SelfBackupFormView({
  destinations,
  current,
  pending,
  runPending,
  verifyPending,
  msg,
  onSubmit,
  onRunNow,
  onVerify,
}: {
  destinations: { id: string; name: string; type: string }[];
  current: { enabled: boolean; destinationId: string; lastRunAt: string | null; lastStatus: string | null };
  pending: boolean;
  runPending: boolean;
  verifyPending: boolean;
  msg: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onRunNow: () => void;
  onVerify: () => void;
}) {
  const ok = current.lastStatus === "ok";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {destinations.length === 0 ? (
        <p className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">Add an SSH or S3 destination first - local folders die with the machine, so they can&apos;t protect the metadata.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="selfBackupDest">Destination (off-site recommended)</Label>
            <Select id="selfBackupDest" name="destinationId" defaultValue={current.destinationId} className="max-w-xs">
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.type})
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="enabled" defaultChecked={current.enabled} className="h-4 w-4" />
            Keep an always-current copy of the metadata (runs automatically after changes)
          </label>
          {current.lastRunAt && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              Last run: <span className="text-foreground">{current.lastRunAt}</span>
              <Badge tone={ok ? "success" : "danger"}>{ok ? "ok" : "failed"}</Badge>
              {!ok && current.lastStatus && <span className="text-[var(--color-danger)]">{current.lastStatus}</span>}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" disabled={runPending || !current.enabled} onClick={onRunNow} title={current.enabled ? "Dump and upload the metadata now" : "Enable and save first"}>
              {runPending ? "Backing up…" : "Back up now"}
            </Button>
            <Button type="button" variant="ghost" disabled={verifyPending || !current.enabled} onClick={onVerify} title="Download + decrypt the latest self-backup to prove it's recoverable (no restore)">
              {verifyPending ? "Verifying…" : "Verify recovery path"}
            </Button>
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          </div>
        </>
      )}
    </form>
  );
}
