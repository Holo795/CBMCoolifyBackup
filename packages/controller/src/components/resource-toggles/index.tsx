"use client";

import { useState, useTransition } from "react";
import { updateResourceSettings } from "@/app/actions";
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
}: {
  id: string;
  backupEnabled: boolean;
  liveBackup: boolean;
  verbose?: boolean;
}) {
  const [enabled, setEnabled] = useState(backupEnabled);
  const [live, setLive] = useState(liveBackup);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = (next: { enabled: boolean; live: boolean }) => {
    const fd = new FormData();
    if (next.enabled) fd.set("backupEnabled", "on");
    if (next.live) fd.set("liveBackup", "on");
    start(async () => {
      await updateResourceSettings(id, fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <ResourceTogglesView
      verbose={verbose}
      enabled={enabled}
      live={live}
      pending={pending}
      saved={saved}
      onEnabledChange={(v) => {
        setEnabled(v);
        save({ enabled: v, live });
      }}
      onLiveChange={(v) => {
        setLive(v);
        save({ enabled, live: v });
      }}
    />
  );
}
