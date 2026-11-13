"use client";

import { Button, Input, Field, Disclosure, SwitchRow, OptionCards } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { ShieldAlert, Download, Upload, KeyRound, FileJson } from "lucide-react";

/** Presentation only: generate + import the recovery file. Logic in ./index.tsx. */
export function RecoveryFilePanelView({
  current,
  password,
  code,
  passphrase,
  passphrase2,
  kind,
  onCodeChange,
  onPassphraseChange,
  onPassphrase2Change,
  onKindChange,
  importPassphrase,
  onImportPassphraseChange,
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
  current: { generation: number; at: string | null; stale: boolean; staleReason: string | null; hasSelfBackup: boolean; twoFactor: boolean };
  password: string;
  code: string;
  passphrase: string;
  passphrase2: string;
  kind: "light" | "full";
  onCodeChange: (v: string) => void;
  onPassphraseChange: (v: string) => void;
  onPassphrase2Change: (v: string) => void;
  onKindChange: (v: "light" | "full") => void;
  importPassphrase: string;
  onImportPassphraseChange: (v: string) => void;
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
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onGenerate();
        }}
      >
        <OptionCards
          name="rf-kind"
          label={t("settings.recoveryKind")}
          value={kind}
          onChange={onKindChange}
          columns={2}
          options={[
            { value: "light", title: t("settings.recoveryKindLight"), hint: t("settings.recoveryKindLightHint") },
            { value: "full", title: t("settings.recoveryKindFull"), hint: t("settings.recoveryKindFullHint") },
          ]}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("settings.recoveryPassphrase")} htmlFor="rf-passphrase" hint={t("settings.recoveryPassphraseHint")}>
            <Input id="rf-passphrase" type="password" value={passphrase} onChange={(e) => onPassphraseChange(e.target.value)} autoComplete="new-password" minLength={12} />
          </Field>
          <Field label={t("settings.recoveryPassphraseConfirm")} htmlFor="rf-passphrase2">
            <Input id="rf-passphrase2" type="password" value={passphrase2} onChange={(e) => onPassphrase2Change(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={t("settings.recoveryFileConfirmPassword")} htmlFor="rf-password" hint={t("settings.recoveryFileDownloadNote")}>
            <Input
              id="rf-password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder={t("settings.recoveryFileAdminPassword")}
              autoComplete="current-password"
            />
          </Field>
          {current.twoFactor && (
            <Field label={t("settings.recoveryCode")} htmlFor="rf-code">
              <Input id="rf-code" value={code} onChange={(e) => onCodeChange(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" />
            </Field>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            loading={busy === "export"}
            disabled={
              busy !== null ||
              !password ||
              passphrase.length < 12 ||
              passphrase !== passphrase2 ||
              (current.twoFactor && !code) ||
              (kind === "light" && !current.hasSelfBackup)
            }
          >
            <Download /> {t("settings.generateDownload")}
          </Button>
        </div>
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
                accept=".cbmrec,.json,application/octet-stream,application/json"
                onChange={(e) => onImportFileChange(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-[13px] file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-foreground"
              />
            </label>
          </Field>
          <Field label={t("settings.importPassphraseLabel")} htmlFor="rf-import-passphrase" hint={t("settings.importPassphraseHint")}>
            <Input
              id="rf-import-passphrase"
              type="password"
              value={importPassphrase}
              onChange={(e) => onImportPassphraseChange(e.target.value)}
              autoComplete="off"
            />
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
