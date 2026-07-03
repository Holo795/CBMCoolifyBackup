"use client";

import { Button, Input, Label } from "@/components/ui";
import { ShieldAlert, Download, Upload, KeyRound } from "lucide-react";

/** Presentation only: generate + import the recovery file. Logic in ./index.tsx. */
export function RecoveryFilePanelView({
  current,
  password,
  busy,
  msg,
  importPassword,
  importConfirm,
  importOverride,
  onPasswordChange,
  onGenerate,
  onImportFileChange,
  onImportPasswordChange,
  onImportConfirmChange,
  onImportOverrideChange,
  onImport,
}: {
  current: { generation: number; at: string | null; stale: boolean; staleReason: string | null; hasSelfBackup: boolean };
  password: string;
  busy: "export" | "import" | null;
  msg: { ok: boolean; text: string } | null;
  importPassword: string;
  importConfirm: string;
  importOverride: boolean;
  onPasswordChange: (v: string) => void;
  onGenerate: () => void;
  onImportFileChange: (f: File | null) => void;
  onImportPasswordChange: (v: string) => void;
  onImportConfirmChange: (v: string) => void;
  onImportOverrideChange: (v: boolean) => void;
  onImport: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* --- Generate --- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Recovery file</h4>
        </div>
        <p className="text-xs text-muted-foreground">A single downloadable file that IS your recovery key: it carries the master key and the address of your latest self-backup. Store it in a password manager / vault. It only needs re-downloading if your master key or the self-backup destination changes.</p>

        {!current.hasSelfBackup && (
          <p className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">Enable the metadata self-backup above first - the recovery file needs a destination to point at.</p>
        )}

        {current.generation > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Current: <span className="text-foreground">generation {current.generation}</span>
            {current.at && <span>· {current.at}</span>}
            {current.stale && (
              <span className="inline-flex items-center gap-1 text-[var(--color-warning)]">
                <ShieldAlert className="h-3.5 w-3.5" /> out of date - re-download ({current.staleReason})
              </span>
            )}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="rf-password">Confirm your password to download</Label>
          <div className="flex items-center gap-2">
            <Input
              id="rf-password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Your admin password"
              className="max-w-xs"
              autoComplete="current-password"
            />
            <Button variant="primary" disabled={busy !== null || !password || !current.hasSelfBackup} onClick={onGenerate}>
              <Download className="h-3.5 w-3.5" />
              {busy === "export" ? "Generating…" : "Generate & download"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Downloading generates a new file and supersedes the previous one - destroy older copies.</p>
        </div>
      </div>

      {/* --- Import --- */}
      <details className="border-t pt-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Upload className="h-4 w-4 text-muted-foreground" /> Import a recovery file (rebuild this install)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"><strong>Destructive.</strong> This replaces every instance, destination, snapshot record and account with the recovery file&apos;s. After import you are signed out - sign back in with the <strong>OLD</strong> credentials from the imported install. Run this on a fresh CBM.</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-import-file">Recovery file</Label>
            <input
              id="rf-import-file"
              type="file"
              accept="application/json,.json"
              onChange={(e) => onImportFileChange(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-import-password">Your password</Label>
            <Input
              id="rf-import-password"
              type="password"
              value={importPassword}
              onChange={(e) => onImportPasswordChange(e.target.value)}
              className="max-w-xs"
              autoComplete="current-password"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-import-confirm">Type IMPORT to confirm</Label>
            <Input
              id="rf-import-confirm"
              value={importConfirm}
              onChange={(e) => onImportConfirmChange(e.target.value)}
              placeholder="IMPORT"
              className="max-w-xs font-mono"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={importOverride}
              onChange={(e) => onImportOverrideChange(e.target.checked)}
              className="h-4 w-4"
            />
            This install already has data - replace everything anyway
          </label>
          <div>
            <Button variant="danger" disabled={busy !== null || importConfirm !== "IMPORT"} onClick={onImport}>
              {busy === "import" ? "Importing…" : "Import & overwrite"}
            </Button>
          </div>
        </div>
      </details>

      {msg && <span className={`text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>{msg.text}</span>}
    </div>
  );
}
