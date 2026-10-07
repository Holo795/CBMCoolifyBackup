"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreSnapshot, restoreVersions } from "@/app/actions";
import type { ImageChoice } from "@/lib/image-pin";
import { RestoreActionsView } from "./view";

/**
 * Restore (in place) and clone ("→ new" a new Coolify resource) buttons, each
 * confirmed in a dialog. Both need a live agent. On trigger we navigate to the
 * snapshot's page so the operator watches the restore log live.
 *
 * With several connected instances, the clone dialog offers a target instance
 * (migration). `allowNew={false}` hides cloning (a Coolify control-plane
 * snapshot can only be restored in place); `allowInPlace={false}` hides the
 * in-place restore (a configuration-only snapshot has no data to put back).
 */
export function RestoreActions({
  snapshotId,
  hasAgent,
  size = "sm",
  instances,
  currentInstanceId,
  allowNew = true,
  allowInPlace = true,
}: {
  snapshotId: string;
  hasAgent: boolean;
  allowNew?: boolean;
  allowInPlace?: boolean;
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
  // The image versions the restore would run, read when a dialog opens.
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof restoreVersions>> | null | "loading">(null);
  const [imageChoice, setImageChoice] = useState<ImageChoice>("snapshot");
  useEffect(() => {
    if (!dialog) return;
    let live = true;
    setVersions("loading");
    setImageChoice("snapshot");
    restoreVersions(snapshotId)
      .then((v) => live && setVersions(v))
      .catch(() => live && setVersions(null));
    return () => {
      live = false;
    };
  }, [dialog, snapshotId]);
  const v = versions && versions !== "loading" ? versions : null;
  // In place, the choice only exists when the running version differs and CBM can put the snapshot's back.
  const choiceOffered = dialog === "new_resource" ? !!v?.pinnable : !!(v?.mismatch && v.canRedeploy);

  const run = (target: "in_place" | "new_resource") => {
    if (!hasAgent || pending) return;
    start(async () => {
      const r = await restoreSnapshot(
        snapshotId,
        target,
        target === "new_resource" && targetId && targetId !== currentInstanceId ? targetId : undefined,
        choiceOffered ? imageChoice : undefined,
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
      allowInPlace={allowInPlace}
      pending={pending}
      dialog={dialog}
      onDialog={setDialog}
      onConfirm={run}
      picker={canPickTarget ? { instances: instances!, targetId, onTargetChange: setTargetId } : undefined}
      versions={versions}
      choiceOffered={choiceOffered}
      imageChoice={imageChoice}
      onImageChoice={setImageChoice}
    />
  );
}
