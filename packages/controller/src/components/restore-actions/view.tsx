"use client";

import { Button, Select } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { RotateCcw } from "lucide-react";

/** Presentation only: the restore / "→ new" buttons (+ optional target-instance
 * picker for cross-instance migration). Logic in ./index.tsx. */
export function RestoreActionsView({
  size,
  hasAgent,
  pending,
  busy,
  error,
  onRun,
  picker,
}: {
  size: "sm" | "md";
  hasAgent: boolean;
  pending: boolean;
  busy: "in_place" | "new_resource" | null;
  error: string | null;
  onRun: (target: "in_place" | "new_resource") => void;
  picker?: {
    open: boolean;
    instances: { id: string; name: string }[];
    targetId: string;
    onTargetChange: (id: string) => void;
    onGo: () => void;
    onClose: () => void;
  };
}) {
  const t = useT();
  const disabledTitle = hasAgent ? undefined : t("snapshots.noAgentTitle");

  return (
    <span className="relative inline-flex items-center gap-1.5">
      <Button size={size} variant="outline" disabled={!hasAgent || pending} title={disabledTitle} onClick={() => onRun("in_place")}>
        <RotateCcw className="h-3.5 w-3.5" />
        {busy === "in_place" ? t("snapshots.restoring") : t("snapshots.restore")}
      </Button>
      <Button
        size={size}
        variant="ghost"
        disabled={!hasAgent || pending}
        title={hasAgent ? t("snapshots.cloneTitle") : disabledTitle}
        onClick={() => onRun("new_resource")}
      >
        {busy === "new_resource" ? t("snapshots.cloning") : t("snapshots.toNew")}
      </Button>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}

      {picker?.open && (
        <span className="absolute right-0 top-full z-20 mt-1.5 flex w-72 flex-col gap-2 rounded-lg border bg-card p-3 shadow-lg">
          <span className="text-xs font-medium">{t("snapshots.restoreOnto")}</span>
          <Select value={picker.targetId} onChange={(e) => picker.onTargetChange(e.target.value)} aria-label={t("snapshots.targetInstanceAria")}>
            {picker.instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted-foreground">{t("snapshots.migrationHint")}</span>
          <span className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={picker.onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" variant="primary" disabled={pending} onClick={picker.onGo}>
              {busy === "new_resource" ? t("snapshots.cloning") : t("snapshots.restoreToNew")}
            </Button>
          </span>
        </span>
      )}
    </span>
  );
}
