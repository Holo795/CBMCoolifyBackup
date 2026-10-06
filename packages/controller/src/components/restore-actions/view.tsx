"use client";

import { Copy, RotateCcw } from "lucide-react";
import { Button, Dialog, DialogContent, DialogClose, Field, Select, Tooltip } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: restore / clone buttons and their confirmation dialogs. Logic in ./index.tsx. */
export function RestoreActionsView({
  size,
  hasAgent,
  allowNew,
  allowInPlace,
  pending,
  dialog,
  onDialog,
  onConfirm,
  picker,
}: {
  size: "sm" | "md";
  hasAgent: boolean;
  allowNew: boolean;
  allowInPlace: boolean;
  pending: boolean;
  dialog: "in_place" | "new_resource" | null;
  onDialog: (d: "in_place" | "new_resource" | null) => void;
  onConfirm: (target: "in_place" | "new_resource") => void;
  picker?: {
    instances: { id: string; name: string }[];
    targetId: string;
    onTargetChange: (id: string) => void;
  };
}) {
  const t = useT();
  const reason = hasAgent ? undefined : t("snapshots.noAgentTitle");
  const wrap = (el: React.ReactElement) =>
    reason ? (
      <Tooltip content={reason}>
        <span tabIndex={0} className="inline-flex">
          {el}
        </span>
      </Tooltip>
    ) : (
      el
    );

  return (
    <span className="inline-flex items-center gap-1.5">
      {allowInPlace &&
        wrap(
          <Button size={size} disabled={!hasAgent} onClick={() => onDialog("in_place")}>
            <RotateCcw /> {t("snapshots.restore")}
          </Button>,
        )}
      {allowNew &&
        wrap(
          <Tooltip content={hasAgent ? t("snapshots.cloneTitle") : undefined}>
            <Button
              size={size}
              variant={allowInPlace ? "ghost" : "secondary"}
              disabled={!hasAgent}
              onClick={() => onDialog("new_resource")}
            >
              <Copy /> {t("snapshots.clone")}
            </Button>
          </Tooltip>,
        )}

      <Dialog open={dialog !== null} onOpenChange={(v) => !v && onDialog(null)}>
        {dialog && (
          <DialogContent
            title={dialog === "in_place" ? t("snapshots.restoreDialogTitle") : t("snapshots.cloneDialogTitle")}
            description={dialog === "in_place" ? t("snapshots.restoreDialogBody") : t("snapshots.cloneDialogBody")}
            footer={
              <>
                <DialogClose asChild>
                  <Button>{t("common.cancel")}</Button>
                </DialogClose>
                <Button
                  variant={dialog === "in_place" ? "danger" : "primary"}
                  loading={pending}
                  onClick={() => onConfirm(dialog)}
                >
                  {dialog === "in_place" ? t("snapshots.restoreConfirm") : t("snapshots.cloneConfirm")}
                </Button>
              </>
            }
          >
            {dialog === "new_resource" && picker ? (
              <Field label={t("snapshots.restoreOnto")} hint={t("snapshots.migrationHint")} htmlFor="restore-target">
                <Select id="restore-target" value={picker.targetId} onChange={(e) => picker.onTargetChange(e.target.value)}>
                  {picker.instances.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {dialog === "in_place" ? t("snapshots.restoreInPlaceConfirm") : t("snapshots.cloneTitle")}
              </p>
            )}
          </DialogContent>
        )}
      </Dialog>
    </span>
  );
}
