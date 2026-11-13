"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/components/i18n-provider";
import { RecoveryFilePanelView } from "./view";

/**
 * Generate (reveal-once, password re-auth) and import the recovery file.
 * Markup in ./view.tsx.
 */
export function RecoveryFilePanel({
  current,
}: {
  current: {
    generation: number;
    at: string | null;
    stale: boolean;
    staleReason: string | null;
    hasSelfBackup: boolean;
    twoFactor: boolean;
  };
}) {
  const t = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  // Light by default when a self-backup exists to point to.
  const [kind, setKind] = useState<"light" | "full">(current.hasSelfBackup ? "light" : "full");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importConfirm, setImportConfirm] = useState("");
  const [importOverride, setImportOverride] = useState(false);

  const flash = (ok: boolean, text: string) => (ok ? toast.success(text, { duration: 12000 }) : toast.error(text));

  const onGenerate = async () => {
    if (passphrase !== passphrase2) {
      flash(false, t("settings.recoveryPassphraseMismatch"));
      return;
    }
    setBusy("export");
    try {
      const res = await fetch("/api/recovery/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, code, passphrase, kind }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        flash(false, body.error ?? t("settings.exportFailed", { status: res.status }));
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "cbm-recovery.cbmrec";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setPassword("");
      setCode("");
      setPassphrase("");
      setPassphrase2("");
      flash(true, t("settings.recoveryDownloaded"));
      router.refresh();
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    if (!importFile) {
      flash(false, t("settings.pickFileFirst"));
      return;
    }
    setBusy("import");
    try {
      const fd = new FormData();
      fd.set("file", importFile);
      fd.set("password", importPassword);
      fd.set("passphrase", importPassphrase);
      fd.set("confirm", importConfirm);
      fd.set("override", String(importOverride));
      const res = await fetch("/api/recovery/import", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || body.error) {
        flash(false, body.error ?? t("settings.importFailed", { status: res.status }));
        return;
      }
      flash(true, `${body.detail ?? t("settings.importedDefault")}${t("settings.importedSignedOut")}`);
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <RecoveryFilePanelView
      current={current}
      password={password}
      code={code}
      passphrase={passphrase}
      passphrase2={passphrase2}
      kind={kind}
      onCodeChange={setCode}
      onPassphraseChange={setPassphrase}
      onPassphrase2Change={setPassphrase2}
      onKindChange={setKind}
      importPassphrase={importPassphrase}
      onImportPassphraseChange={setImportPassphrase}
      busy={busy}
      importPassword={importPassword}
      importConfirm={importConfirm}
      importOverride={importOverride}
      onPasswordChange={setPassword}
      onGenerate={onGenerate}
      onImportFileChange={setImportFile}
      onImportPasswordChange={setImportPassword}
      onImportConfirmChange={setImportConfirm}
      onImportOverrideChange={setImportOverride}
      onImport={onImport}
    />
  );
}
