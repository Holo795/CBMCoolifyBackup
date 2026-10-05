"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  };
}) {
  const t = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importConfirm, setImportConfirm] = useState("");
  const [importOverride, setImportOverride] = useState(false);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    if (ok) setTimeout(() => setMsg(null), 12000);
  };

  const onGenerate = async () => {
    setBusy("export");
    setMsg(null);
    try {
      const res = await fetch("/api/recovery/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        flash(false, body.error ?? t("settings.exportFailed", { status: res.status }));
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "cbm-recovery.json";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setPassword("");
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
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", importFile);
      fd.set("password", importPassword);
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
      busy={busy}
      msg={msg}
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
