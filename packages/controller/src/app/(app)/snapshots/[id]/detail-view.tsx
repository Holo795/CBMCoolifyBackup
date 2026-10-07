import { shownStatus } from "@/lib/snapshot-status";
import type { Prisma, RestoreJob, RestoreDrill } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Meta, Code, statusTone } from "@/components/ui";
import { repinDeployment, drillSnapshotNow } from "@/app/actions";
import { snapshotDeleteItems } from "@/components/snapshot-delete";
import { ActionButton } from "@/components/action-button";
import { ActionsMenu, type MenuAction } from "@/components/actions-menu";
import { RestoreActions } from "@/components/restore-actions";
import { Gate } from "@/components/role-gate";
import { LiveLog } from "@/components/live-log";
import { getT } from "@/lib/i18n";
import { can, requireUser } from "@/lib/session";
import { modeLabel, captureLabel } from "@/lib/schedule";
import { formatBytes, formatDateTime } from "@/lib/cn";
import { GitCommitHorizontal, Info, ShieldCheck, Check, X, AlertCircle, Boxes, FileArchive, Lock, Database, AlertTriangle } from "lucide-react";
import { drillTone } from "@/lib/status";
import { type DESTINATION_SECRETS } from "@/lib/public-fields";
import { CONFIG_ONLY_CAPTURE } from "@cbm/shared";
import { localizeDrillDetail } from "@/lib/drill-detail";

type DrillCheckRow = { artifact: string; kind: string; engine?: string; ok: boolean; detail: string };

type SnapshotDetail = Prisma.SnapshotGetPayload<{
  include: {
    resource: true;
    destination: { omit: typeof DESTINATION_SECRETS };
    artifacts: true;
    _count: { select: { mirrors: true } };
  };
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
  const isOperator = can(await requireUser(), "operator");
  const manifest = snapshot.manifest as { provenance?: { gitCommitSha?: string; imageDigest?: string } } | null;
  const ok = snapshot.status === "succeeded";
  // Nothing but the configuration was kept (a running app with no volume or
  // database): it can be cloned, but not restored in place or test-restored.
  const configOnly = snapshot.captureMode === CONFIG_ONLY_CAPTURE;
  const canRepin = ok && !agentDown && !!manifest?.provenance?.gitCommitSha && manifest.provenance.gitCommitSha !== "HEAD";

  const menu: MenuAction[] = [
    { kind: "link", label: t("snapshots.openResource"), icon: <Boxes />, href: `/resources/${snapshot.resourceId}` },
    ...(isOperator && ok && !configOnly
      ? [{ label: t("snapshots.drillNow"), icon: <ShieldCheck />, action: drillSnapshotNow.bind(null, snapshot.id) }]
      : []),
    ...(isOperator && canRepin
      ? [
          {
            label: t("snapshots.repin"),
            icon: <GitCommitHorizontal />,
            action: repinDeployment.bind(null, snapshot.id),
            confirm: t("snapshots.repinConfirm"),
          },
        ]
      : []),
    ...(isOperator
      ? ([
          { kind: "separator" },
          ...snapshotDeleteItems(
            t,
            { id: snapshot.id, mirrors: snapshot._count.mirrors, protectedDest: snapshot.destination.protected },
            {
              confirmWord: "DELETE",
              title: t("snapshots.deleteTitle"),
              redirectTo: "/snapshots",
              body: (
                <>
                  {t("snapshots.deleteBodyPlain", { size: formatBytes(snapshot.sizeBytes) })}{" "}
                  <b className="text-foreground">{t("snapshots.deleteBodyFiles")}</b> {t("snapshots.deleteBodyEnd")}
                </>
              ),
            },
          ),
        ] satisfies MenuAction[])
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/snapshots", label: t("snapshots.title") }}
        title={snapshot.resource.name}
        badges={
          <Badge tone={statusTone(shownStatus(snapshot))} dot>
            {t(`snapshots.status.${shownStatus(snapshot)}`)}
          </Badge>
        }
        description={`${modeLabel(snapshot.mode, t)} · ${captureLabel(snapshot.captureMode, t)} · ${snapshot.destination.name} · ${formatDateTime(snapshot.startedAt, tz)}`}
        action={
          <>
            {ok && (
              <Gate min="operator">
                <RestoreActions
                  snapshotId={snapshot.id}
                  hasAgent={!agentDown}
                  size="md"
                  instances={instances}
                  currentInstanceId={snapshot.resource.instanceId}
                  allowNew={!snapshot.resource.coolifyUuid.startsWith("coolify-self")}
                  allowInPlace={!configOnly}
                />
              </Gate>
            )}
            <ActionsMenu items={menu} size="icon" />
          </>
        }
      />

      {configOnly && (
        <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-[13px] shadow-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="font-medium">{t("snapshots.configOnlyTitle")}</p>
            <p className="text-muted-foreground">{t("snapshots.configOnlyBody")}</p>
          </div>
        </div>
      )}

      {snapshot.status === "succeeded" && snapshot.warnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-semibold text-warning">{t("snapshots.warningsTitle")}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground">
              {snapshot.warnings.map((w) => (
                <li key={w} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {snapshot.error && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px]">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="font-semibold text-danger">{t("snapshots.rowError")}</p>
            <p className="break-words text-foreground">{snapshot.error}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("snapshots.backupLogTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <LiveLog id={snapshot.id} initialStatus={snapshot.status} timeZone={tz} />
            </CardContent>
          </Card>

          {ok && !configOnly && (
            <Card>
              <CardHeader
                actions={
                  <Gate min="operator">
                    <ActionButton action={drillSnapshotNow.bind(null, snapshot.id)} size="sm">
                      <ShieldCheck /> {t("snapshots.drillNow")}
                    </ActionButton>
                  </Gate>
                }
              >
                <CardTitle>{t("snapshots.drillsTitle")}</CardTitle>
                <CardDescription>{t("snapshots.drillsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {drills.length === 0 && <p className="text-[13px] text-muted-foreground">{t("snapshots.drillsNone")}</p>}
                {drills.map((d) => {
                  const checks = (Array.isArray(d.checks) ? d.checks : []) as unknown as DrillCheckRow[];
                  return (
                    <div key={d.id} className="flex flex-col gap-2 rounded-lg border bg-surface p-3">
                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <Badge tone={drillTone(d.status)} dot>
                          {t(`snapshots.drillStatus.${d.status}`)}
                        </Badge>
                        <span className="text-muted-foreground">
                          {t(`snapshots.drillTrigger.${d.trigger}`)} · {formatDateTime(d.createdAt, tz)}
                          {d.durationMs != null && ` · ${Math.max(1, Math.round(d.durationMs / 1000))}s`}
                        </span>
                      </div>
                      {d.error && <p className="text-xs text-danger">{d.error}</p>}
                      {checks.length > 0 && (
                        <ul className="flex flex-col gap-1.5 text-xs">
                          {checks.map((c, i) => (
                            // A drill's checks are a fixed, read-only list.
                            // eslint-disable-next-line @eslint-react/no-array-index-key
                            <li key={i} className="flex min-w-0 items-start gap-2">
                              {c.ok ? (
                                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                              ) : (
                                <X className="mt-0.5 size-3.5 shrink-0 text-danger" />
                              )}
                              <span className="min-w-0 break-words">
                                <span className="font-mono">{c.artifact}</span>
                                <span className="text-muted-foreground"> - {localizeDrillDetail(c.detail, t)}</span>
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
            <Card>
              <CardHeader>
                <CardTitle>{t("snapshots.restoresTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {restores.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Badge tone={statusTone(r.status)} dot>
                        {t(`snapshots.status.${r.status}`)}
                      </Badge>
                      <span className="text-muted-foreground">
                        {r.target === "new_resource" ? t("snapshots.restoreTargetNew") : t("snapshots.restoreTargetInPlace")} ·{" "}
                        {formatDateTime(r.createdAt, tz)}
                      </span>
                    </div>
                    {r.error && <p className="text-xs text-danger">{r.error}</p>}
                    <LiveLog id={r.id} kind="restore" initialStatus={r.status} timeZone={tz} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("snapshots.detailsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Meta
                className="grid-cols-1 gap-y-3 [&_dt]:text-xs"
                items={[
                  { label: t("snapshots.rowSize"), value: <span className="tabular font-medium">{formatBytes(snapshot.sizeBytes)}</span> },
                  { label: t("snapshots.rowDirectory"), value: <Code>{snapshot.destinationDir || "-"}</Code> },
                  { label: t("snapshots.rowCommit"), value: <Code>{manifest?.provenance?.gitCommitSha ?? "-"}</Code> },
                  { label: t("snapshots.rowImage"), value: <Code>{manifest?.provenance?.imageDigest ?? "-"}</Code> },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("snapshots.artifactsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {snapshot.artifacts.map((a) => (
                <div key={a.id} className="flex min-w-0 items-start gap-2.5 rounded-lg border bg-surface px-3 py-2">
                  {a.kind === "db-dump" ? (
                    <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileArchive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-xs">{a.filename}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="tabular">{formatBytes(a.sizeBytes)}</span>
                      {a.encrypted && (
                        <span className="inline-flex items-center gap-1 text-success">
                          · <Lock className="size-3" /> {t("snapshots.enc")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {snapshot.artifacts.length === 0 && <p className="text-[13px] text-muted-foreground">{t("snapshots.noArtifacts")}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
