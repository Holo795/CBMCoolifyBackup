"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
        flash(false, body.error ?? `Export failed (${res.status})`);
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
      flash(true, "Recovery file downloaded - store it in a vault and destroy older copies.");
      router.refresh();
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    if (!importFile) {
      flash(false, "Pick a recovery file first");
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
        flash(false, body.error ?? `Import failed (${res.status})`);
        return;
      }
      flash(
        true,
        `${body.detail ?? "Imported."} You are signed out now - sign back in with your OLD credentials.`,
      );
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
