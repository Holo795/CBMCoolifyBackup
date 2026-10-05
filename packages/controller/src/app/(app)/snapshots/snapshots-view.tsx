import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, Badge, Button, statusTone, EmptyState } from "@/components/ui";
import { retrySnapshot, cancelSnapshot, deleteSnapshot } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { RestoreActions } from "@/components/restore-actions";
import { Gate } from "@/components/role-gate";
import { getT } from "@/lib/i18n";
import { formatBytes, timeAgo } from "@/lib/cn";
import { drillTone } from "@/lib/status";
import { Archive, RefreshCw, X, ShieldCheck } from "lucide-react";

type SnapshotRow = Prisma.SnapshotGetPayload<{
  include: {
    resource: true;
    destination: true;
    _count: { select: { artifacts: true } };
    drills: { select: { status: true } };
  };
}>;

/** The latest finished test-restore of a snapshot, as a small badge. */
function DrillBadge({ s, label }: { s: SnapshotRow; label: (status: string) => string }) {
  const d = s.drills[0];
  if (!d || d.status === "running") return null;
  return (
    <Badge tone={drillTone(d.status)} title={label(d.status)}>
      <ShieldCheck className="h-3 w-3" />
      <span className="sr-only">{label(d.status)}</span>
    </Badge>
  );
}

/** Presentation only: the Snapshots list markup. Data is fetched in ./page.tsx. */
export async function SnapshotsView({
  snapshots,
  liveInstanceIds,
}: {
  snapshots: SnapshotRow[];
  liveInstanceIds: Set<string | null>;
}) {
  const t = await getT();
  // Row actions, reused by the desktop table and the mobile cards.
  const snapshotActions = (s: SnapshotRow, hasAgent: boolean) => (
    <>
      {s.status === "succeeded" && <RestoreActions snapshotId={s.id} hasAgent={hasAgent} />}
      {s.status === "failed" &&
        (hasAgent ? (
          <ActionButton action={retrySnapshot.bind(null, s.id)} variant="outline" size="sm" successMsg={t("snapshots.retried")}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("snapshots.retry")}
          </ActionButton>
        ) : (
          <Button variant="outline" size="sm" disabled title={t("snapshots.noLiveAgent")}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("snapshots.retry")}
          </Button>
        ))}
      {s.status === "running" && (
        <ActionButton action={cancelSnapshot.bind(null, s.id)} variant="ghost" size="sm" successMsg={t("snapshots.cancelled")}>
          <X className="h-3.5 w-3.5" /> {t("common.cancel")}
        </ActionButton>
      )}
      <ConfirmDeleteButton
        action={deleteSnapshot.bind(null, s.id)}
        confirmWord="DELETE"
        title={t("snapshots.deleteTitle")}
        body={
          <>{t("snapshots.deleteBodyBefore")} <b>{s.resource.name}</b> {t("snapshots.deleteBodyAfterName", { size: formatBytes(s.sizeBytes) })} <b>{t("snapshots.deleteBodyFiles")}</b> {t("snapshots.deleteBodyEnd")}</>
        }
      />
    </>
  );

  return (
    <>
      <PageHeader title={t("snapshots.title")} description={t("snapshots.description")} />
      {snapshots.length === 0 ? (
        <EmptyState icon={<Archive className="h-6 w-6" />} title={t("snapshots.emptyTitle")} hint={t("snapshots.emptyHint")} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("snapshots.colResource")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("snapshots.colMode")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("snapshots.colStatus")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("snapshots.colArtifacts")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("snapshots.colSize")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("snapshots.colWhen")}</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => {
                  const hasAgent = liveInstanceIds.has(s.resource.instanceId);
                  return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/snapshots/${s.id}`} className="font-medium hover:underline">
                        {s.resource.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{s.destination.name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {s.mode} · {s.captureMode}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1">
                        <Badge tone={statusTone(s.status)}>{t(`snapshots.status.${s.status}`)}</Badge>
                        <DrillBadge s={s} label={(st) => t(`snapshots.drillBadge.${st}`)} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{s._count.artifacts}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{formatBytes(s.sizeBytes)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(s.startedAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Gate min="operator">{snapshotActions(s, hasAgent)}</Gate>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile: one card per snapshot. */}
            <div className="divide-y md:hidden">
              {snapshots.map((s) => {
                const hasAgent = liveInstanceIds.has(s.resource.instanceId);
                return (
                  <div key={s.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/snapshots/${s.id}`} className="font-medium hover:underline">
                          {s.resource.name}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{s.destination.name}</div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <Badge tone={statusTone(s.status)}>{t(`snapshots.status.${s.status}`)}</Badge>
                        <DrillBadge s={s} label={(st) => t(`snapshots.drillBadge.${st}`)} />
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{s.mode} · {s.captureMode}</span>
                      <span>{t("snapshots.artifactsCount", { count: s._count.artifacts })}</span>
                      <span>{formatBytes(s.sizeBytes)}</span>
                      <span>{timeAgo(s.startedAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Gate min="operator">{snapshotActions(s, hasAgent)}</Gate>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
