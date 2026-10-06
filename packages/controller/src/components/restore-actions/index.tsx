"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreSnapshot } from "@/app/actions";
import { RestoreActionsView } from "./view";

/**
 * Restore (in place) and clone ("→ new" a new Coolify resource) buttons, each
 * confirmed in a dialog. Both need a live agent. On trigger we navigate to the
 * snapshot's page so the operator watches the restore log live.
 *
 * With several connected instances, the clone dialog offers a target instance
 * (migration). `allowNew={false}` hides cloning (a Coolify control-plane
 * snapshot can only be restored in place).
 */
export function RestoreActions({
  snapshotId,
  hasAgent,
  size = "sm",
  instances,
  currentInstanceId,
  allowNew = true,
}: {
  snapshotId: string;
  hasAgent: boolean;
  allowNew?: boolean;
  size?: "sm" | "md";
  /** Connected instances to offer as "Restore onto" targets (detail page). */
  instances?: { id: string; name: string }[];
  currentInstanceId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"in_place" | "new_resource" | null>(null);
  const [targetId, setTargetId] = useState(currentInstanceId ?? "");
  const canPickTarget = (instances?.length ?? 0) > 1 && !!currentInstanceId;

  const run = (target: "in_place" | "new_resource") => {
    if (!hasAgent || pending) return;
    start(async () => {
      const r = await restoreSnapshot(
        snapshotId,
        target,
        target === "new_resource" && targetId && targetId !== currentInstanceId ? targetId : undefined,
      );
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      setDialog(null);
      router.push(`/snapshots/${snapshotId}`);
    });
  };

  return (
    <RestoreActionsView
      size={size}
      hasAgent={hasAgent}
      allowNew={allowNew}
      pending={pending}
      dialog={dialog}
      onDialog={setDialog}
      onConfirm={run}
      picker={canPickTarget ? { instances: instances!, targetId, onTargetChange: setTargetId } : undefined}
    />
  );
}
