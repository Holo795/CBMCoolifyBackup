import type { Prisma, RestoreJob, RestoreDrill } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge, statusTone } from "@/components/ui";
import { repinDeployment, deleteSnapshot, drillSnapshotNow } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { RestoreActions } from "@/components/restore-actions";
import { Gate } from "@/components/role-gate";
import { LiveLog } from "@/components/live-log";
import { getT } from "@/lib/i18n";
import { formatBytes, formatDateTime } from "@/lib/cn";
import { GitCommitHorizontal, ShieldCheck, Check, X } from "lucide-react";
import { drillTone } from "@/lib/status";
import { type DESTINATION_SECRETS } from "@/lib/public-fields";

type DrillCheckRow = { artifact: string; kind: string; engine?: string; ok: boolean; detail: string };

type SnapshotDetail = Prisma.SnapshotGetPayload<{
  include: { resource: true; destination: { omit: typeof DESTINATION_SECRETS }; artifacts: true };
}>;

/** Presentation only: the snapshot-detail markup. Data is fetched in ./page.tsx. */
export async function SnapshotDetailView({
  snapshot,
  restores,
  drills,
  tz,
  agentDown,
  instances,
}: {
  snapshot: SnapshotDetail;
  restores: RestoreJob[];
  drills: RestoreDrill[];
  tz: string;
  agentDown: boolean;
  /** Connected instances, offered as "Restore onto" targets (migration). */
  instances: { id: string; name: string }[];
}) {
  const t = await getT();
  const manifest = snapshot.manifest as { provenance?: { gitCommitSha?: string; imageDigest?: string } } | null;

  return (
    <>
      <PageHeader
        title={snapshot.resource.name}
        description={`${snapshot.mode} · ${snapshot.captureMode} · ${snapshot.destination.name}`}
        action={
          <Gate min="operator">
          <div className="flex items-center gap-2">
            {snapshot.status === "succeeded" &&
              !agentDown &&
              manifest?.provenance?.gitCommitSha &&
              manifest.provenance.gitCommitSha !== "HEAD" && (
                <ActionButton
                  action={repinDeployment.bind(null, snapshot.id)}
                  variant="outline"
                  size="md"
                  confirm={t("snapshots.repinConfirm")}
                >
                  <GitCommitHorizontal className="h-4 w-4" /> {t("snapshots.repin")}
                </ActionButton>
              )}
            {snapshot.status === "succeeded" && (
              <RestoreActions
                snapshotId={snapshot.id}
                hasAgent={!agentDown}
                size="md"
                instances={instances}
                currentInstanceId={snapshot.resource.instanceId}
              />
            )}
            <ConfirmDeleteButton
              action={deleteSnapshot.bind(null, snapshot.id)}
              confirmWord="DELETE"
              title={t("snapshots.deleteTitle")}
              variant="outline"
              size="md"
              label={t("common.delete")}
              redirectTo="/snapshots"
              body={
                <>{t("snapshots.deleteBodyPlain", { size: formatBytes(snapshot.sizeBytes) })} <b>{t("snapshots.deleteBodyFiles")}</b> {t("snapshots.deleteBodyEnd")}</>
              }
            />
          </div>
          </Gate>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("snapshots.detailsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row k={t("snapshots.rowStatus")} v={<Badge tone={statusTone(snapshot.status)}>{t(`snapshots.status.${snapshot.status}`)}</Badge>} />
            <Row k={t("snapshots.rowDirectory")} v={<span className="font-mono text-xs">{snapshot.destinationDir}</span>} />
            <Row k={t("snapshots.rowSize")} v={formatBytes(snapshot.sizeBytes)} />
            <Row k={t("snapshots.rowCommit")} v={<span className="font-mono text-xs">{manifest?.provenance?.gitCommitSha ?? "-"}</span>} />
            <Row k={t("snapshots.rowImage")} v={<span className="font-mono text-xs">{manifest?.provenance?.imageDigest ?? "-"}</span>} />
            {snapshot.error && <Row k={t("snapshots.rowError")} v={<span className="text-[var(--color-danger)]">{snapshot.error}</span>} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("snapshots.artifactsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {snapshot.artifacts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0 overflow-x-auto whitespace-nowrap">
                  <span className="font-mono text-xs">{a.filename}</span>
                </div>
                <span className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                  {a.encrypted && <Badge tone="success">{t("snapshots.enc")}</Badge>}
                  {formatBytes(a.sizeBytes)}
                </span>
              </div>
            ))}
            {snapshot.artifacts.length === 0 && <span className="text-muted-foreground">{t("snapshots.noArtifacts")}</span>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("snapshots.backupLogTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LiveLog id={snapshot.id} initialStatus={snapshot.status} timeZone={tz} />
        </CardContent>
      </Card>

      {snapshot.status === "succeeded" && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{t("snapshots.drillsTitle")}</CardTitle>
              <Gate min="operator">
                <ActionButton action={drillSnapshotNow.bind(null, snapshot.id)} variant="outline" size="sm">
                  <ShieldCheck className="h-3.5 w-3.5" /> {t("snapshots.drillNow")}
                </ActionButton>
              </Gate>
            </div>
            <p className="text-sm text-muted-foreground">{t("snapshots.drillsDesc")}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {drills.length === 0 && <p className="text-sm text-muted-foreground">{t("snapshots.drillsNone")}</p>}
            {drills.map((d) => {
              const checks = (Array.isArray(d.checks) ? d.checks : []) as unknown as DrillCheckRow[];
              return (
                <div key={d.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={drillTone(d.status)}>{t(`snapshots.drillStatus.${d.status}`)}</Badge>
                    <span className="text-muted-foreground">
                      {t(`snapshots.drillTrigger.${d.trigger}`)} · {formatDateTime(d.createdAt, tz)}
                      {d.durationMs != null && ` · ${Math.max(1, Math.round(d.durationMs / 1000))}s`}
                    </span>
                    {d.error && <span className="text-xs text-[var(--color-danger)]">{d.error}</span>}
                  </div>
                  {checks.length > 0 && (
                    <ul className="flex flex-col gap-1 rounded-md border p-3 text-xs">
                      {checks.map((c, i) => (
                        // A drill's checks are a fixed, read-only list.
                        // eslint-disable-next-line @eslint-react/no-array-index-key
                        <li key={i} className="flex min-w-0 items-start gap-2">
                          {c.ok ? (
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
                          ) : (
                            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-danger)]" />
                          )}
                          <span className="min-w-0">
                            <span className="font-mono">{c.artifact}</span>
                            <span className="text-muted-foreground"> - {c.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.status === "running" && <LiveLog id={d.id} kind="drill" initialStatus={d.status} timeZone={tz} />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {restores.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("snapshots.restoresTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {restores.map((r) => (
              <div key={r.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge tone={statusTone(r.status)}>{t(`snapshots.status.${r.status}`)}</Badge>
                  <span className="text-muted-foreground">
                    {r.target === "new_resource" ? t("snapshots.restoreTargetNew") : t("snapshots.restoreTargetInPlace")} · {formatDateTime(r.createdAt, tz)}
                  </span>
                  {r.error && <span className="text-xs text-[var(--color-danger)]">{r.error}</span>}
                </div>
                <LiveLog id={r.id} kind="restore" initialStatus={r.status} timeZone={tz} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-0 min-w-0">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <div className="min-w-0 overflow-x-auto whitespace-nowrap text-right">{v}</div>
    </div>
  );
}
