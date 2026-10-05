"use client";

import { Check, Loader2 } from "lucide-react";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the per-resource backup switches. Logic in ./index.tsx. */
export function ResourceTogglesView({
  verbose,
  enabled,
  live,
  pending,
  saved,
  onEnabledChange,
  onLiveChange,
}: {
  verbose: boolean;
  enabled: boolean;
  live: boolean;
  pending: boolean;
  saved: boolean;
  onEnabledChange: (v: boolean) => void;
  onLiveChange: (v: boolean) => void;
}) {
  const t = useT();
  const status = pending ? (
    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  ) : saved ? (
    <Check className="h-3 w-3 text-[var(--color-success)]" />
  ) : null;

  if (verbose) {
    return (
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium">{t("resources.toggles.enabledLabel")}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t("resources.toggles.enabledDesc")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={live} onChange={(e) => onLiveChange(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium">{t("resources.toggles.liveLabel")}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t("resources.toggles.liveDesc")}</span>
          </span>
        </label>
        <div className="h-4 text-xs text-muted-foreground">{status}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs" title={t("resources.toggles.enabledLabel")}>
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />{" "}
        {t("resources.toggles.on")}
      </label>
      <label className="flex items-center gap-1.5 text-xs" title={t("resources.toggles.liveTitle")}>
        <input type="checkbox" checked={live} onChange={(e) => onLiveChange(e.target.checked)} />{" "}
        {t("resources.toggles.live")}
      </label>
      <span className="flex h-3 w-3 items-center justify-center">{status}</span>
    </div>
  );
}
