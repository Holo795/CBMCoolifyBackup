"use client";

import { AlertTriangle, Copy, RotateCcw } from "lucide-react";
import { Button, Code, Dialog, DialogContent, DialogClose, Field, OptionCards, Select, Tooltip } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { rowKey, type ImageChoice, type VersionRow } from "@/lib/image-pin";

type Versions = { rows: VersionRow[]; commit?: string; pinnable: boolean; mismatch: boolean; canRedeploy: boolean };

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
  versions,
  choiceOffered,
  imageChoice,
  onImageChoice,
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
  versions: Versions | null | "loading";
  choiceOffered: boolean;
  imageChoice: ImageChoice;
  onImageChoice: (c: ImageChoice) => void;
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
            <VersionsPanel
              mode={dialog}
              versions={versions}
              choiceOffered={choiceOffered}
              imageChoice={imageChoice}
              onImageChoice={onImageChoice}
            />
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

const shortDigest = (d?: string) => (d ? d.slice(d.indexOf("@") + 1, d.indexOf("@") + 20) + "…" : undefined);

/** The snapshot's image versions next to the references as written (and, in
 * place, what runs now), with the choice of which one the restore runs. */
function VersionsPanel({
  mode,
  versions,
  choiceOffered,
  imageChoice,
  onImageChoice,
}: {
  mode: "in_place" | "new_resource";
  versions: Versions | null | "loading";
  choiceOffered: boolean;
  imageChoice: ImageChoice;
  onImageChoice: (c: ImageChoice) => void;
}) {
  const t = useT();
  if (versions === "loading") return <p className="text-xs text-muted-foreground">{t("snapshots.versionsLoading")}</p>;
  if (!versions || versions.rows.length === 0) return null;
  const inPlace = mode === "in_place";
  const snapshotVersion = versions.rows.map((r) => r.version ?? shortDigest(r.digest)).filter(Boolean).join(", ");
  return (
    <div className="mb-3 space-y-2.5">
      <div className="text-[13px] font-medium">{t("snapshots.versionsTitle")}</div>
      <ul className="space-y-1.5 text-xs">
        {versions.rows.map((r) => (
          <li key={rowKey(r)} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
            {r.name && <div className="mb-0.5 font-medium">{r.name}</div>}
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
              <span>{t("snapshots.versionsSnapshot")}</span>
              <span className="min-w-0 break-all text-foreground">
                {versions.commit
                  ? t("snapshots.versionsCommit", { sha: versions.commit.slice(0, 12) })
                  : (r.version ?? t("snapshots.versionsUnknown"))}
                {r.digest && <Code className="ml-1.5">{shortDigest(r.digest)}</Code>}
              </span>
              <span>{t("snapshots.versionsWritten")}</span>
              <span className="min-w-0 break-all">
                <Code>{r.written}</Code>
              </span>
              {inPlace && (
                <>
                  <span>{t("snapshots.versionsRunning")}</span>
                  <span className={r.running === "different" ? "font-medium text-warning" : undefined}>
                    {r.running === "same"
                      ? t("snapshots.runningSame")
                      : r.running === "different"
                        ? t("snapshots.runningDifferent")
                        : t("snapshots.runningUnknown")}
                  </span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {inPlace && versions.mismatch && (
        <p className="flex gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {versions.canRedeploy ? t("snapshots.mismatchWarning") : `${t("snapshots.mismatchWarning")} ${t("snapshots.mismatchManual")}`}
        </p>
      )}
      {choiceOffered && (
        <OptionCards<ImageChoice>
          name="image-choice"
          label={t("snapshots.versionsTitle")}
          columns={1}
          value={imageChoice}
          onChange={onImageChoice}
          options={
            inPlace
              ? [
                  { value: "snapshot", title: t("snapshots.redeploySnapshot"), hint: t("snapshots.redeploySnapshotHint") },
                  { value: "current", title: t("snapshots.keepRunning"), hint: t("snapshots.keepRunningHint") },
                ]
              : [
                  { value: "snapshot", title: t("snapshots.pinSnapshot"), hint: t("snapshots.pinSnapshotHint") },
                  { value: "current", title: t("snapshots.pinCurrent"), hint: t("snapshots.pinCurrentHint") },
                ]
          }
        />
      )}
      {!inPlace && choiceOffered && imageChoice === "current" && snapshotVersion && (
        <p className="flex gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {t("snapshots.pinCurrentWarning", { version: snapshotVersion })}
        </p>
      )}
    </div>
  );
}
