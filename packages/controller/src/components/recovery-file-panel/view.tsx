"use client";

import { Button, Input, Label } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
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
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      {/* --- Generate --- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">{t("settings.recoveryFileTitle")}</h4>
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.recoveryFileDesc")}</p>

        {!current.hasSelfBackup && (
          <p className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">{t("settings.recoveryFileNoSelfBackup")}</p>
        )}

        {current.generation > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t("settings.recoveryFileCurrent")} <span className="text-foreground">{t("settings.recoveryFileGeneration", { n: current.generation })}</span>
            {current.at && <span>· {current.at}</span>}
            {current.stale && (
              <span className="inline-flex items-center gap-1 text-[var(--color-warning)]">
                <ShieldAlert className="h-3.5 w-3.5" /> {t("settings.recoveryFileStale", { reason: current.staleReason ?? "" })}
              </span>
            )}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="rf-password">{t("settings.recoveryFileConfirmPassword")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="rf-password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder={t("settings.recoveryFileAdminPassword")}
              className="max-w-xs"
              autoComplete="current-password"
            />
            <Button variant="primary" disabled={busy !== null || !password || !current.hasSelfBackup} onClick={onGenerate}>
              <Download className="h-3.5 w-3.5" />
              {busy === "export" ? t("settings.generating") : t("settings.generateDownload")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.recoveryFileDownloadNote")}</p>
        </div>
      </div>

      {/* --- Import --- */}
      <details className="border-t pt-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Upload className="h-4 w-4 text-muted-foreground" /> {t("settings.importTitle")}
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"><strong>{t("settings.importWarnDestructive")}</strong>{t("settings.importWarnBody1")}<strong>{t("settings.importWarnOld")}</strong>{t("settings.importWarnBody2")}</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-import-file">{t("settings.recoveryFileTitle")}</Label>
            <input
              id="rf-import-file"
              type="file"
              accept="application/json,.json"
              onChange={(e) => onImportFileChange(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-import-password">{t("settings.importPasswordLabel")}</Label>
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
            <Label htmlFor="rf-import-confirm">{t("settings.importConfirmLabel")}</Label>
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
            {t("settings.importOverrideLabel")}
          </label>
          <div>
            <Button variant="danger" disabled={busy !== null || importConfirm !== "IMPORT"} onClick={onImport}>
              {busy === "import" ? t("settings.importing") : t("settings.importOverwrite")}
            </Button>
          </div>
        </div>
      </details>

      {msg && <span className={`text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>{msg.text}</span>}
    </div>
  );
}
