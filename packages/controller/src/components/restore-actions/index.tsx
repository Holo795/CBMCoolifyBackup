"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreSnapshot } from "@/app/actions";
import { RestoreActionsView } from "./view";

/**
 * Restore (in place) and "→ new" (clone to a new Coolify resource) buttons.
 * Both need a live agent. On trigger we navigate to the snapshot's page so the
 * operator watches the restore log live (instead of a stale "queued" toast).
 */
export function RestoreActions({
  snapshotId,
  hasAgent,
  size = "sm",
}: {
  snapshotId: string;
  hasAgent: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"in_place" | "new_resource" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRun = (target: "in_place" | "new_resource") => {
    if (!hasAgent || pending) return;
    if (target === "in_place" && !window.confirm("Restore this snapshot in place? This overwrites current data.")) return;
    setError(null);
    setBusy(target);
    start(async () => {
      const r = await restoreSnapshot(snapshotId, target);
      if (r?.error) {
        setError(r.error);
        setBusy(null);
      } else {
        router.push(`/snapshots/${snapshotId}`);
      }
    });
  };

  return <RestoreActionsView size={size} hasAgent={hasAgent} pending={pending} busy={busy} error={error} onRun={onRun} />;
}
