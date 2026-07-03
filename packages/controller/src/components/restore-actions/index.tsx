"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreSnapshot } from "@/app/actions";
import { RestoreActionsView } from "./view";

/**
 * Restore (in place) and "→ new" (clone to a new Coolify resource) buttons.
 * Both need a live agent. On trigger we navigate to the snapshot's page so the
 * operator watches the restore log live (instead of a stale "queued" toast).
 *
 * When `instances` (>1) is provided, "→ new" opens a target-instance picker so
 * a backup can be restored onto a DIFFERENT connected Coolify (migration).
 */
export function RestoreActions({
  snapshotId,
  hasAgent,
  size = "sm",
  instances,
  currentInstanceId,
}: {
  snapshotId: string;
  hasAgent: boolean;
  size?: "sm" | "md";
  /** Connected instances to offer as "Restore onto" targets (detail page). */
  instances?: { id: string; name: string }[];
  currentInstanceId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"in_place" | "new_resource" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetId, setTargetId] = useState(currentInstanceId ?? "");
  const canPickTarget = (instances?.length ?? 0) > 1 && !!currentInstanceId;

  const run = (target: "in_place" | "new_resource", targetInstanceId?: string) => {
    if (!hasAgent || pending) return;
    if (target === "in_place" && !window.confirm("Restore this snapshot in place? This overwrites current data.")) return;
    setError(null);
    setBusy(target);
    start(async () => {
      const r = await restoreSnapshot(
        snapshotId,
        target,
        targetInstanceId && targetInstanceId !== currentInstanceId ? targetInstanceId : undefined,
      );
      if (r?.error) {
        setError(r.error);
        setBusy(null);
      } else {
        setPickerOpen(false);
        router.push(`/snapshots/${snapshotId}`);
      }
    });
  };

  const onRun = (target: "in_place" | "new_resource") => {
    // With several instances connected, "→ new" first opens the target picker.
    if (target === "new_resource" && canPickTarget) {
      setPickerOpen((v) => !v);
      return;
    }
    run(target);
  };

  return (
    <RestoreActionsView
      size={size}
      hasAgent={hasAgent}
      pending={pending}
      busy={busy}
      error={error}
      onRun={onRun}
      picker={
        canPickTarget
          ? {
              open: pickerOpen,
              instances: instances!,
              targetId,
              onTargetChange: setTargetId,
              onGo: () => run("new_resource", targetId),
              onClose: () => setPickerOpen(false),
            }
          : undefined
      }
    />
  );
}
