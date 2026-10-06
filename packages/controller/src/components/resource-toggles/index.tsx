"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateResourceSettings } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { ResourceTogglesView } from "./view";

/**
 * Per-resource backup switches that save themselves on toggle (no Save button):
 *  - backupEnabled: include the resource in scheduled backups (the single gate);
 *  - liveBackup: copy volumes live without freezing (at the operator's risk).
 */
export function ResourceToggles({
  id,
  backupEnabled,
  liveBackup,
  verbose = false,
  disabled,
}: {
  id: string;
  backupEnabled: boolean;
  liveBackup: boolean;
  verbose?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(backupEnabled);
  const [live, setLive] = useState(liveBackup);
  const [pending, start] = useTransition();

  const save = (next: { enabled: boolean; live: boolean }, revert: () => void) => {
    const fd = new FormData();
    if (next.enabled) fd.set("backupEnabled", "on");
    if (next.live) fd.set("liveBackup", "on");
    start(async () => {
      try {
        await updateResourceSettings(id, fd);
      } catch (e) {
        revert();
        toast.error((e as Error).message || t("common.error"));
      }
    });
  };

  return (
    <ResourceTogglesView
      verbose={verbose}
      enabled={enabled}
      live={live}
      disabled={disabled || pending}
      onEnabledChange={(v) => {
        setEnabled(v);
        save({ enabled: v, live }, () => setEnabled(!v));
      }}
      onLiveChange={(v) => {
        setLive(v);
        save({ enabled, live: v }, () => setLive(!v));
      }}
    />
  );
}
