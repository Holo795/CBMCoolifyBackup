import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { ScheduleForm } from "@/components/schedule-form";
import { ActionButton } from "@/components/action-button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  StatusDot,
  Stat,
  EmptyState,
  Disclosure,
  Table,
  THead,
  TH,
  TR,
  TD,
  List,
  ListItem,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  statusTone,
} from "@/components/ui";
import { ResourceToggles } from "@/components/resource-toggles";
import { ResourceIcon } from "@/components/resource-icon";
import { HooksForm } from "@/components/hooks-form";
import { setResourceSchedule, removeResourceOverride, backupNow, deleteSnapshot } from "@/app/actions";
import { ActionsMenu } from "@/components/actions-menu";
import { RestoreActions } from "@/components/restore-actions";
import { Gate } from "@/components/role-gate";
import { getT } from "@/lib/i18n";
import { effectivePolicy, describeCron, cronToFrequency, modeLabel, captureLabel } from "@/lib/schedule";
import { resourceStatusLabel } from "@/lib/status";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/cn";
import { Play, Unplug, Archive, CalendarClock, HardDrive, Clock, Trash2, ExternalLink, Undo2, Trash } from "lucide-react";
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
  // Coolify's own control plane can only be restored in place, never "→ new".
  const controlPlane = resource.coolifyUuid.startsWith("coolify-self");
  // Where the inherited schedule comes from (most specific wins, see effectivePolicy).
  const inheritedFrom =
    eff.source === "server"
      ? t("resources.scheduleFromServer", { name: resource.serverName ?? resource.serverUuid ?? "" })
      : eff.source === "instance"
        ? t("resources.scheduleFromInstance", { name: resource.instance.name })
        : eff.source === "global"
          ? t("resources.scheduleFromGlobal")
          : null;
  const active = override ?? (inheritedFrom ? eff.policy : null);
  const succeeded = snapshots.filter((s) => s.status === "succeeded");
  const last = snapshots[0];
  const stored = succeeded.reduce((n, s) => n + Number(s.sizeBytes), 0);
  const deleteItem = (s: SnapshotRow) => ({
    kind: "delete" as const,
    label: t("common.delete"),
    icon: <Trash2 />,
    action: deleteSnapshot.bind(null, s.id),
    confirmWord: t("resources.deleteConfirmWord"),
    title: t("resources.deleteSnapshotTitle"),
    body: (
      <>
        {t("resources.deleteSnapshotBodyPre", { size: formatBytes(s.sizeBytes) })}
        <b className="text-foreground">{t("resources.deleteSnapshotBodyBold")}</b>
        {t("resources.deleteSnapshotBodyPost")}
      </>
    ),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/resources", label: t("resources.title") }}
        title={
          <span className="flex items-center gap-3">
            <ResourceIcon type={resource.type} controlPlane={controlPlane} className="size-9" />
            {resource.name}
          </span>
        }
        badges={
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <StatusDot tone={statusTone(resource.status)} /> {resourceStatusLabel(t, resource.status)}
          </span>
        }
        description={[resource.type, resource.instance.name, resource.projectName, resource.serverName].filter(Boolean).join(" · ")}
        action={
          agentDown || removed ? undefined : (
            <Gate min="operator">
              <ActionButton action={backupNow.bind(null, resource.id)} variant="primary" size="md" successMsg={t("resources.backupQueued")}>
                <Play /> {t("resources.backUpNow")}
              </ActionButton>
            </Gate>
          )
        }
      />

      {removed && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <Trash className="mt-0.5 size-4 shrink-0" /> {t("resources.removedBanner")}
        </div>
      )}
      {agentDown && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px]">
          <Unplug className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-warning">{t("resources.agentUnavailable")}</p>
            <p className="text-muted-foreground">
              {t("resources.agentUnavailableDetailPre")} <span className="text-foreground">{resource.instance.name}</span>
              {t("resources.agentUnavailableDetailPost")}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t("resources.lastBackup")}
          icon={<Clock />}
          value={last ? timeAgo(last.startedAt, t) : t("resources.never")}
          hint={
            last ? (
              <span className="inline-flex items-center gap-1.5">
                <StatusDot tone={statusTone(last.status)} /> {t(`snapshots.status.${last.status}`)} · {formatDateTime(last.startedAt, tz)}
              </span>
            ) : undefined
          }
          className="[&_.tabular]:text-xl"
        />
        <Stat
          label={t("resources.effectiveSchedule")}
          icon={<CalendarClock />}
          value={active ? describeCron(active.cron, t, tz) : t("resources.noScheduleShort")}
          tone={active ? undefined : "warning"}
          hint={active ? `${active.destination.name} · ${modeLabel(active.mode, t)}` : t("resources.scheduleNone")}
          className="[&_.tabular]:text-xl"
        />
        <Stat
          label={t("resources.storedTotal")}
          icon={<HardDrive />}
          value={formatBytes(stored)}
          hint={t("resources.storedHint", { count: succeeded.length })}
          className="[&_.tabular]:text-xl"
        />
      </div>

      <Tabs defaultValue="snapshots">
        <TabsList>
          <TabsTrigger value="snapshots">
            <Archive /> {t("resources.tabs.snapshots")}
            <Badge>{snapshots.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <CalendarClock /> {t("resources.tabs.schedule")}
          </TabsTrigger>
          <TabsTrigger value="options">{t("resources.tabs.options")}</TabsTrigger>
        </TabsList>

        <TabsContent value="snapshots" className="pt-5 focus-visible:outline-none">
          {snapshots.length === 0 ? (
            <EmptyState icon={<Archive />} title={t("resources.noSnapshots")} />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("resources.colWhen")}</TH>
                      <TH>{t("resources.colMode")}</TH>
                      <TH>{t("resources.colStatus")}</TH>
                      <TH className="text-right">{t("resources.colSize")}</TH>
                      <TH>{t("resources.colDestination")}</TH>
                      <TH className="w-px" />
                    </tr>
                  </THead>
                  <tbody>
                    {snapshots.map((s) => (
                      <TR key={s.id}>
                        <TD>
                          <Link href={`/snapshots/${s.id}`} className="font-medium hover:underline">
                            {timeAgo(s.startedAt, t)}
                          </Link>
                          <p className="text-xs text-muted-foreground">{formatDateTime(s.startedAt, tz)}</p>
                        </TD>
                        <TD className="text-[13px] text-muted-foreground">
                          {modeLabel(s.mode, t)} · {captureLabel(s.captureMode, t)}
                        </TD>
                        <TD>
                          <Badge tone={statusTone(s.status)} dot>
                            {t(`snapshots.status.${s.status}`)}
                          </Badge>
                        </TD>
                        <TD className="tabular text-right text-[13px] text-muted-foreground">{formatBytes(s.sizeBytes)}</TD>
                        <TD className="text-[13px] text-muted-foreground">{s.destination.name}</TD>
                        <TD>
                          <div className="flex items-center justify-end gap-1">
                            <Gate min="operator">
                              {s.status === "succeeded" && (
                                <RestoreActions snapshotId={s.id} hasAgent={!agentDown} allowNew={!controlPlane} />
                              )}
                              <ActionsMenu
                                items={[
                                  { kind: "link", label: t("resources.viewSnapshot"), icon: <ExternalLink />, href: `/snapshots/${s.id}` },
                                  { kind: "separator" },
                                  deleteItem(s),
                                ]}
                              />
                            </Gate>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
              <List className="md:hidden">
                {snapshots.map((s) => (
                  <ListItem key={s.id} className="flex-wrap">
                    <StatusDot tone={statusTone(s.status)} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/snapshots/${s.id}`} className="block font-medium hover:underline">
                        {timeAgo(s.startedAt, t)}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {modeLabel(s.mode, t)} · {formatBytes(s.sizeBytes)} · {s.destination.name}
                      </p>
                    </div>
                    <Gate min="operator">
                      {s.status === "succeeded" && <RestoreActions snapshotId={s.id} hasAgent={!agentDown} allowNew={!controlPlane} />}
                    </Gate>
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </TabsContent>

        <TabsContent value="schedule" className="pt-5 focus-visible:outline-none">
          <Card>
            <CardHeader
              actions={
                override ? (
                  <Gate min="admin">
                    <form action={removeResourceOverride.bind(null, resource.id)}>
                      <button
                        type="submit"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Undo2 className="size-3.5" /> {t("resources.revertToInherited")}
                      </button>
                    </form>
                  </Gate>
                ) : undefined
              }
            >
              <CardTitle className="flex items-center gap-2">
                {t("resources.schedule")}
                {override && <Badge tone="accent">{t("resources.overrideBadge")}</Badge>}
              </CardTitle>
              <CardDescription>
                {override ? (
                  <>
                    {t("resources.scheduleOverrideDesc")}{" "}
                    <span className="text-foreground">{describeCron(override.cron, t, tz)}</span> → {override.destination.name} ·{" "}
                    {modeLabel(override.mode, t)}
                  </>
                ) : inheritedFrom && eff.policy ? (
                  <>
                    {inheritedFrom} <span className="text-foreground">{describeCron(eff.policy.cron, t, tz)}</span> →{" "}
                    {eff.policy.destination.name} · {modeLabel(eff.policy.mode, t)}
                  </>
                ) : (
                  <span className="text-warning">{t("resources.scheduleNone")}</span>
                )}
              </CardDescription>
            </CardHeader>
            <Gate min="admin">
              <CardContent>
                <Disclosure summary={override ? t("resources.editOverride") : t("resources.overrideSchedule")}>
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
                </Disclosure>
              </CardContent>
            </Gate>
          </Card>
        </TabsContent>

        <TabsContent value="options" className="flex flex-col gap-6 pt-5 focus-visible:outline-none">
          <Gate min="operator">
            <Card>
              <CardHeader>
                <CardTitle>{t("resources.optionsTitle")}</CardTitle>
                <CardDescription>{t("resources.backupOptionsInfo")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResourceToggles
                  id={resource.id}
                  backupEnabled={resource.backupEnabled}
                  liveBackup={resource.liveBackup}
                  verbose
                  disabled={removed}
                />
              </CardContent>
            </Card>
          </Gate>

          {/* Hooks run arbitrary commands inside containers: configuration, admin-only.
              Decided here (server) rather than by <Gate> alone, whose children
              would still reach the browser. */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>{t("resources.hooksTitle")}</CardTitle>
                <CardDescription>{t("resources.hooksDesc")}</CardDescription>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
