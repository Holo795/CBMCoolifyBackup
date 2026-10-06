"use client";

import { Button, Disclosure } from "@/components/ui";
import { KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
import { useT } from "@/components/i18n-provider";

function CommandBox({ text, copied, onCopy, label }: { text: string; copied: boolean; onCopy: () => void; label: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-[#0f1013] p-3 pr-12 font-mono text-xs leading-5 whitespace-pre-wrap break-all text-[#d6d7dc]">
        {text}
      </pre>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onCopy}
        aria-label={label}
        className="absolute right-2 top-2 text-[#9b9ca6] hover:bg-white/10 hover:text-white"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/** Presentation only: the reveal button + revealed command panel. Logic in ./index.tsx. */
export function RevealInstallView({
  data,
  pending,
  hasToken,
  copied,
  onReveal,
  onCopy,
  onHide,
}: {
  data: { oneLiner: string; raw: string } | null;
  pending: boolean;
  hasToken: boolean;
  copied: string | null;
  onReveal: () => void;
  onCopy: (text: string, which: string) => void;
  onHide: () => void;
}) {
  const t = useT();
  if (!data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[13px] leading-5 text-muted-foreground">
          {t("instances.reveal.warnBefore")}
          <b className="text-foreground">{t("instances.reveal.warnOnce")}</b>
          {t("instances.reveal.warnMid")}
          <b className="text-foreground">{t("instances.reveal.warnRotates")}</b>
          {t("instances.reveal.warnAfter")}
        </p>
        <Button variant="primary" onClick={onReveal} loading={pending}>
          <KeyRound />
          {hasToken ? t("instances.reveal.revealNew") : t("instances.reveal.reveal")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs leading-5">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span>
          {t("instances.reveal.warnBefore")}
          <b>{t("instances.reveal.warnOnce")}</b>
          {t("instances.reveal.warnMid")}
          <b>{t("instances.reveal.warnRotates")}</b>
          {t("instances.reveal.warnAfter")}
        </span>
      </div>
      <CommandBox text={data.oneLiner} copied={copied === "one"} onCopy={() => onCopy(data.oneLiner, "one")} label={t("instances.reveal.copyCommand")} />
      <Disclosure summary={t("instances.reveal.rawSummary")}>
        <CommandBox text={data.raw} copied={copied === "raw"} onCopy={() => onCopy(data.raw, "raw")} label={t("instances.reveal.copyDockerRun")} />
      </Disclosure>
      <Button size="sm" variant="ghost" className="self-start" onClick={onHide}>
        {t("instances.reveal.hide")}
      </Button>
    </div>
  );
}
