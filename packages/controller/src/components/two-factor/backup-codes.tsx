"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** The freshly generated backup codes, shown once, with copy and download. */
export function BackupCodes({ codes }: { codes: string[] }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the codes are on screen */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`CBM backup codes\n\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cbm-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border bg-surface px-4 py-3 font-mono text-[13px] tabular">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" onClick={copy}>
          {copied ? <Check className="text-success" /> : <Copy />} {copied ? t("twofactor.copied") : t("twofactor.copyCodes")}
        </Button>
        <Button size="sm" onClick={download}>
          <Download /> {t("twofactor.downloadCodes")}
        </Button>
      </div>
    </div>
  );
}
