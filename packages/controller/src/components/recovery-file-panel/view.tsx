"use client";

import { Button, Input, Field, Disclosure, SwitchRow } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { ShieldAlert, Download, Upload, KeyRound, FileJson } from "lucide-react";

/** Presentation only: generate + import the recovery file. Logic in ./index.tsx. */
export function RecoveryFilePanelView({
  current,
  password,
  busy,
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
    <div className="flex flex-col gap-4">
      {/* --- Generate --- */}
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-muted-foreground" /> {t("settings.recoveryFileTitle")}
        </h3>
        <p className="text-[13px] leading-5 text-muted-foreground">{t("settings.recoveryFileDesc")}</p>
      </div>

      {!current.hasSelfBackup && (
        <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{t("settings.recoveryFileNoSelfBackup")}</p>
      )}

      {current.generation > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          {t("settings.recoveryFileCurrent")}{" "}
          <span className="font-medium text-foreground">{t("settings.recoveryFileGeneration", { n: current.generation })}</span>
          {current.at && <span>· {current.at}</span>}
          {current.stale && (
            <span className="inline-flex items-center gap-1 text-warning">
              <ShieldAlert className="size-3.5" /> {t("settings.recoveryFileStale", { reason: current.staleReason ?? "" })}
            </span>
          )}
        </p>
      )}

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          onGenerate();
        }}
      >
        <Field
          label={t("settings.recoveryFileConfirmPassword")}
          htmlFor="rf-password"
          hint={t("settings.recoveryFileDownloadNote")}
          className="min-w-0 flex-1"
        >
          <Input
            id="rf-password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={t("settings.recoveryFileAdminPassword")}
            autoComplete="current-password"
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          className="sm:mt-6"
          loading={busy === "export"}
          disabled={busy !== null || !password || !current.hasSelfBackup}
        >
          <Download /> {t("settings.generateDownload")}
        </Button>
      </form>

      {/* --- Import --- */}
      <Disclosure
        summary={
          <span className="inline-flex items-center gap-2">
            <Upload className="size-3.5" /> {t("settings.importTitle")}
          </span>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (importConfirm === "IMPORT") onImport();
          }}
        >
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            <strong>{t("settings.importWarnDestructive")}</strong>
            {t("settings.importWarnBody1")}
            <strong>{t("settings.importWarnOld")}</strong>
            {t("settings.importWarnBody2")}
          </p>
          <Field label={t("settings.recoveryFileTitle")} htmlFor="rf-import-file">
            <label
              htmlFor="rf-import-file"
              className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong bg-card px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <FileJson className="size-4 shrink-0" />
              <input
                id="rf-import-file"
                type="file"
                accept="application/json,.json"
                onChange={(e) => onImportFileChange(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-[13px] file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-foreground"
              />
            </label>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("settings.importPasswordLabel")} htmlFor="rf-import-password">
              <Input
                id="rf-import-password"
                type="password"
                value={importPassword}
                onChange={(e) => onImportPasswordChange(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label={t("settings.importConfirmLabel")} htmlFor="rf-import-confirm">
              <Input
                id="rf-import-confirm"
                value={importConfirm}
                onChange={(e) => onImportConfirmChange(e.target.value)}
                placeholder="IMPORT"
                className="font-mono"
              />
            </Field>
          </div>
          <SwitchRow
            id="rf-import-override"
            label={t("settings.importOverrideLabel")}
            checked={importOverride}
            onCheckedChange={onImportOverrideChange}
          />
          <div className="flex justify-end">
            <Button type="submit" variant="danger" loading={busy === "import"} disabled={busy !== null || importConfirm !== "IMPORT"}>
              {t("settings.importOverwrite")}
            </Button>
          </div>
        </form>
      </Disclosure>
    </div>
  );
}
