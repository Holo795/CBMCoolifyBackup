import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { ScheduleForm } from "@/components/schedule-form";
import { ActionButton } from "@/components/action-button";
import { Card, CardContent, CardHeader, CardTitle, Badge, statusTone } from "@/components/ui";
import { ResourceToggles } from "@/components/resource-toggles";
import { HooksForm } from "@/components/hooks-form";
import { setResourceSchedule, removeResourceOverride, backupNow, deleteSnapshot } from "@/app/actions";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { RestoreActions } from "@/components/restore-actions";
import { Gate } from "@/components/role-gate";
import { getT } from "@/lib/i18n";
import { effectivePolicy, describeCron, cronToFrequency, modeLabel, captureLabel } from "@/lib/schedule";
import { formatBytes, timeAgo } from "@/lib/cn";
import { Play, ArrowLeft, Unplug } from "lucide-react";
import { type DESTINATION_SECRETS, type INSTANCE_SECRETS, type PublicDestination } from "@/lib/public-fields";

type ResourceRow = Prisma.ResourceGetPayload<{ include: { instance: { omit: typeof INSTANCE_SECRETS } } }>;
type OverrideRow = Prisma.BackupPolicyGetPayload<{ include: { destination: { omit: typeof DESTINATION_SECRETS } } }>;
type SnapshotRow = Prisma.SnapshotGetPayload<{ include: { destination: { omit: typeof DESTINATION_SECRETS } } }>;
type Eff = Awaited<ReturnType<typeof effectivePolicy>>;

/** Presentation only: the resource-detail markup. Data is fetched in ./page.tsx. */
export async function ResourceDetailView({
  resource,
  destinations,
  override,
  snapshots,
  eff,
  agentDown,
  removed,
  tz,
  isAdmin,
}: {
  resource: ResourceRow;
  destinations: PublicDestination[];
  override: OverrideRow | null;
  snapshots: SnapshotRow[];
  eff: Eff;
  agentDown: boolean;
  removed: boolean;
  tz: string;
  /** Hook commands are admin-only: not even serialized for other roles. */
  isAdmin: boolean;
}) {
  const t = await getT();
  // Where the inherited schedule comes from (most specific wins, see effectivePolicy).
  const inheritedFrom =
    eff.source === "server"
      ? t("resources.scheduleFromServer", { name: resource.serverName ?? resource.serverUuid ?? "" })
      : eff.source === "instance"
        ? t("resources.scheduleFromInstance", { name: resource.instance.name })
        : eff.source === "global"
          ? t("resources.scheduleFromGlobal")
          : null;
  return (
    <>
      <Link href="/resources" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("resources.title")}
      </Link>
      <PageHeader
        title={resource.name}
        description={`${resource.type} · ${resource.instance.name}${resource.projectName ? " · " + resource.projectName : ""}`}
        action={
          agentDown || removed ? undefined : (
            <Gate min="operator">
              <ActionButton action={backupNow.bind(null, resource.id)} variant="primary" size="md" successMsg={t("resources.backupQueued")}>
                <Play className="h-4 w-4" /> {t("resources.backUpNow")}
              </ActionButton>
            </Gate>
          )
        }
      />

      {removed && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {t("resources.removedBanner")}
        </div>
      )}

      <div className="relative">
        <div
          className={agentDown ? "pointer-events-none select-none blur-[3px]" : ""}
          aria-hidden={agentDown || undefined}
        >
      <div className="grid gap-6 lg:grid-cols-2">
        <Gate min="operator">
        <Card>
          <CardHeader>
            <CardTitle>{t("resources.backupOptions")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {t("resources.backupOptionsInfo")}
            </p>
            <ResourceToggles id={resource.id} backupEnabled={resource.backupEnabled} liveBackup={resource.liveBackup} verbose />
          </CardContent>
        </Card>
        </Gate>

        {/* Hooks run arbitrary commands inside containers: configuration, admin-only.
            Decided here (server) rather than by <Gate> alone, whose children
            would still reach the browser. */}
        {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("resources.backupHooks")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HooksForm
              resourceId={resource.id}
              containers={
                Array.isArray(resource.containers)
                  ? (resource.containers as { name: string; service?: string }[])
                  : resource.containerNames.map((name) => ({ name }))
              }
              hooks={
                Array.isArray(resource.hooks)
                  ? (resource.hooks as { container: string; pre?: string; post?: string; timeoutSec?: number }[])
                  : []
              }
            />
          </CardContent>
        </Card>
        )}

        <Gate min="admin">
        <Card>
          <CardHeader>
            <CardTitle>{t("resources.schedule")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {override ? (
                <>{t("resources.scheduleOverrideDesc")}</>
              ) : inheritedFrom && eff.policy ? (
                <>
                  {inheritedFrom}{" "}
                  <span className="text-foreground">{describeCron(eff.policy.cron, t, tz)}</span> →{" "}
                  {eff.policy.destination.name} · {modeLabel(eff.policy.mode, t)}
                </>
              ) : (
                <span className="text-[var(--color-warning)]">{t("resources.scheduleNone")}</span>
              )}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {override && (
              <div className="flex items-center gap-2 text-xs">
                <Badge tone="accent">{t("resources.overrideBadge")}</Badge>
                <span>
                  {describeCron(override.cron, t, tz)} → {override.destination.name} · {modeLabel(override.mode, t)}
                </span>
                <form action={removeResourceOverride.bind(null, resource.id)}>
                  <button type="submit" className="text-[var(--color-danger)] hover:underline">
                    {t("resources.revertToInherited")}
                  </button>
                </form>
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {override ? t("resources.editOverride") : t("resources.overrideSchedule")}
              </summary>
              <div className="mt-3">
                <ScheduleForm
                  action={setResourceSchedule.bind(null, resource.id)}
                  destinations={destinations}
                  submitLabel={override ? t("resources.updateOverride") : t("resources.createOverride")}
                  defaults={
                    override
                      ? {
                          frequency: cronToFrequency(override.cron),
                          customCron: override.cron,
                          destinationId: override.destinationId,
                          mode: override.mode,
                          retentionDaily: override.retentionDaily,
                          retentionWeekly: override.retentionWeekly,
                          retentionMonthly: override.retentionMonthly,
                        }
                      : undefined
                  }
                />
              </div>
            </details>
          </CardContent>
        </Card>
        </Gate>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">{t("resources.snapshotsHeading")}</h2>
      {snapshots.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("resources.noSnapshots")}
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("resources.colWhen")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("resources.colMode")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("resources.colStatus")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("resources.colSize")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("resources.colDestination")}</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/snapshots/${s.id}`} className="hover:underline">
                        {timeAgo(s.startedAt, t)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {modeLabel(s.mode, t)} · {captureLabel(s.captureMode, t)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(s.status)}>{t(`snapshots.status.${s.status}`)}</Badge>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{formatBytes(s.sizeBytes)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.destination.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Gate min="operator">
                          {s.status === "succeeded" && <RestoreActions snapshotId={s.id} hasAgent={!agentDown} />}
                          <ConfirmDeleteButton
                            action={deleteSnapshot.bind(null, s.id)}
                            confirmWord={t("resources.deleteConfirmWord")}
                            title={t("resources.deleteSnapshotTitle")}
                            body={
                              <>{t("resources.deleteSnapshotBodyPre", { size: formatBytes(s.sizeBytes) })}<b>{t("resources.deleteSnapshotBodyBold")}</b>{t("resources.deleteSnapshotBodyPost")}</>
                            }
                          />
                        </Gate>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile: one card per snapshot. */}
            <div className="divide-y md:hidden">
              {snapshots.map((s) => (
                <div key={s.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/snapshots/${s.id}`} className="font-medium hover:underline">
                      {timeAgo(s.startedAt, t)}
                    </Link>
                    <Badge tone={statusTone(s.status)}>{t(`snapshots.status.${s.status}`)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{modeLabel(s.mode, t)} · {captureLabel(s.captureMode, t)}</span>
                    <span>{formatBytes(s.sizeBytes)}</span>
                    <span>{s.destination.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Gate min="operator">
                      {s.status === "succeeded" && <RestoreActions snapshotId={s.id} hasAgent={!agentDown} />}
                      <ConfirmDeleteButton
                        action={deleteSnapshot.bind(null, s.id)}
                        confirmWord={t("resources.deleteConfirmWord")}
                        title={t("resources.deleteSnapshotTitle")}
                        body={
                          <>{t("resources.deleteSnapshotBodyPre", { size: formatBytes(s.sizeBytes) })}<b>{t("resources.deleteSnapshotBodyBold")}</b>{t("resources.deleteSnapshotBodyPost")}</>
                        }
                      />
                    </Gate>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
        </div>
        {agentDown && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl border bg-card/80 px-6 py-5 text-center shadow-lg backdrop-blur-sm">
              <Unplug className="h-6 w-6 text-[var(--color-warning)]" />
              <div className="font-medium">{t("resources.agentUnavailable")}</div>
              <p className="text-sm text-muted-foreground">
                {t("resources.agentUnavailableDetailPre")}{" "}
                <span className="text-foreground">{resource.instance.name}</span>
                {t("resources.agentUnavailableDetailPost")}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
