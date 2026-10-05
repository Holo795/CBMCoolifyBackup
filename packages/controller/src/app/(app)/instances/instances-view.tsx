import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { ScheduleForm } from "@/components/schedule-form";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Button, Badge, statusTone, EmptyState } from "@/components/ui";
import {
  connectInstance,
  syncInstanceAction,
  deleteInstance,
  repointInstance,
  setInstanceSchedule,
  removeInstanceSchedule,
  setServerSchedule,
  removeServerSchedule,
  backupCoolifyInstance,
} from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { RevealInstall } from "@/components/reveal-install";
import { ServerMapForm } from "@/components/server-map-form";
import { Gate } from "@/components/role-gate";
import { timeAgo } from "@/lib/cn";
import { describeCron, cronToFrequency } from "@/lib/schedule";
import { isAgentOnline as agentOnline } from "@/lib/agent-status";
import type { groupServersByInstance } from "@/lib/servers";
import { Server, RefreshCw, Trash2, CalendarClock, ShieldCheck, Pencil } from "lucide-react";
import type { BackupPolicy } from "@/generated/prisma/client";
import type { DESTINATION_SECRETS, INSTANCE_SECRETS, PublicDestination } from "@/lib/public-fields";
import { getT } from "@/lib/i18n";

type PolicyWithDest = BackupPolicy & { destination: PublicDestination };
type InstanceRow = Prisma.CoolifyInstanceGetPayload<{
  omit: typeof INSTANCE_SECRETS;
  include: {
    _count: { select: { resources: true } };
    agents: { select: { status: true; lastSeenAt: true; serverUuid: true } };
    policies: { include: { destination: { omit: typeof DESTINATION_SECRETS } } };
  };
}>;
type RunInfo = { at: Date; ok: number; failed: number; running: number; total: number };
type ServersByInstance = ReturnType<typeof groupServersByInstance>;

/** Presentation only: the Coolify instances markup. Data is fetched in ./page.tsx. */
export async function InstancesView({
  instances,
  destinations,
  tz,
  serversByInstance,
  runByPolicy,
}: {
  instances: InstanceRow[];
  destinations: PublicDestination[];
  tz: string;
  serversByInstance: ServersByInstance;
  runByPolicy: Map<string, RunInfo>;
}) {
  const t = await getT();
  // A schedule block (used both instance-wide and per-server).
  function scheduleBlock(opts: {
    policy: PolicyWithDest | undefined;
    lastRun: RunInfo | undefined;
    action: (fd: FormData) => Promise<void | { ok?: boolean; error?: string; detail?: string }>;
    remove?: () => Promise<void>;
    emptyLabel: string;
  }) {
    const { policy, lastRun, action, remove, emptyLabel } = opts;
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
          {policy ? (
            <span>
              {t("instances.schedule.backupsPrefix")}{" "}
              <span className="font-medium text-foreground">{describeCron(policy.cron, tz)}</span> →{" "}
              {policy.destination.name} · {policy.mode} ·{" "}
              {t("instances.schedule.keep", {
                daily: policy.retentionDaily,
                weekly: policy.retentionWeekly,
                monthly: policy.retentionMonthly,
              })}
            </span>
          ) : (
            <span className="text-[var(--color-warning)]">{t("instances.schedule.none")}</span>
          )}
          {policy && remove && (
            <form action={remove}>
              <button type="submit" className="text-[var(--color-danger)] hover:underline">
                {t("instances.schedule.remove")}
              </button>
            </form>
          )}
        </div>
        {lastRun && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t("instances.schedule.lastRun", { time: timeAgo(lastRun.at, t) })}</span>
            <span className="text-[var(--color-success)]">✓ {lastRun.ok}</span>
            {lastRun.failed > 0 && <span className="text-[var(--color-danger)]">✗ {lastRun.failed}</span>}
            {lastRun.running > 0 && (
              <span className="text-[var(--color-accent)]">⏳ {t("instances.schedule.running", { count: lastRun.running })}</span>
            )}
            <span>
              · {t(lastRun.total === 1 ? "instances.schedule.resourceOne" : "instances.schedule.resourceMany", { count: lastRun.total })}
            </span>
          </div>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {policy ? t("instances.schedule.edit") : emptyLabel}
          </summary>
          <div className="mt-3">
            <ScheduleForm
              action={action}
              destinations={destinations}
              submitLabel={policy ? t("instances.schedule.update") : t("instances.schedule.set")}
              defaults={
                policy
                  ? {
                      frequency: cronToFrequency(policy.cron),
                      customCron: policy.cron,
                      destinationId: policy.destinationId,
                      mode: policy.mode,
                      retentionDaily: policy.retentionDaily,
                      retentionWeekly: policy.retentionWeekly,
                      retentionMonthly: policy.retentionMonthly,
                    }
                  : undefined
              }
            />
          </div>
        </details>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t("instances.pageTitle")} description={t("instances.pageDescription")} />

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3">
          {instances.length === 0 ? (
            <EmptyState
              icon={<Server className="h-6 w-6" />}
              title={t("instances.empty.title")}
              hint={t("instances.empty.hint")}
            />
          ) : (
            instances.map((i) => {
              const liveAgents = i.agents.filter(agentOnline).length;
              const staleAgents = i.agents.length - liveAgents;
              const servers = [...(serversByInstance.get(i.id)?.entries() ?? [])].map(([uuid, name]) => ({ uuid, name }));
              const multiServer = servers.length > 1;
              const instancePolicy = i.policies.find((p) => !p.serverUuid);
              return (
                <Card key={i.id}>
                  <CardContent className="flex flex-col gap-4 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="font-medium">{i.name}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">{i.baseUrl}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("instances.summary.resources", { count: i._count.resources })} ·{" "}
                          {servers.length > 0
                            ? `${t(servers.length === 1 ? "instances.summary.serverOne" : "instances.summary.serverMany", { count: servers.length })} · `
                            : ""}
                          {t(liveAgents === 1 ? "instances.summary.agentOne" : "instances.summary.agentMany", { count: liveAgents })} ·{" "}
                          {t("instances.summary.synced", { time: timeAgo(i.lastSyncedAt, t) })}
                        </div>
                      </div>
                      <Gate min="admin">
                        <div className="flex shrink-0 gap-2">
                          <form action={syncInstanceAction.bind(null, i.id)}>
                            <Button size="sm" variant="outline" type="submit">
                              <RefreshCw className="h-3.5 w-3.5" /> {t("instances.sync")}
                            </Button>
                          </form>
                          <form action={deleteInstance.bind(null, i.id)}>
                            <Button size="sm" variant="danger" type="submit" aria-label={t("common.delete")}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </div>
                      </Gate>
                    </div>

                    {/* Instance-level: control-plane backup + shared install command. */}
                    <div className="flex flex-col gap-3 border-t pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {!multiServer && (
                          <>
                            <span className="text-xs text-muted-foreground">{t("instances.agentLabel")}</span>
                            <Badge tone={statusTone(liveAgents > 0 ? "online" : staleAgents > 0 ? "offline" : "pending")}>
                              {liveAgents > 0
                                ? t("instances.badge.connected")
                                : staleAgents > 0
                                  ? t("instances.badge.agentOffline")
                                  : t("instances.badge.notInstalled")}
                            </Badge>
                          </>
                        )}
                        {i.enrollTokenSetAt && (
                          <span className="font-mono text-xs text-muted-foreground" title={t("instances.enrollTokenTitle")}>
                            {i.enrollTokenHint}
                          </span>
                        )}
                        <Gate min="operator">
                          {liveAgents > 0 ? (
                            <ActionButton
                              action={backupCoolifyInstance.bind(null, i.id)}
                              variant="outline"
                              size="sm"
                              successMsg={t("instances.backupQueued")}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> {t("instances.backupCoolify")}
                            </ActionButton>
                          ) : (
                            <Button variant="outline" size="sm" disabled title={t("instances.noLiveAgentTitle")}>
                              <ShieldCheck className="h-3.5 w-3.5" /> {t("instances.backupCoolify")}
                            </Button>
                          )}
                        </Gate>
                      </div>
                      <Gate min="admin">
                        <RevealInstall instanceId={i.id} hasToken={!!i.enrollTokenSetAt} />
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            <Pencil className="mr-1 inline h-3.5 w-3.5" />
                            {t("instances.editInstance")}
                          </summary>
                          <div className="mt-3 max-w-md">
                            <p className="mb-3 text-xs text-muted-foreground">{t("instances.repointHint")}</p>
                            <ActionForm action={repointInstance.bind(null, i.id)} submitLabel={t("instances.repointSubmit")} resetOnSuccess={false}>
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`baseUrl-${i.id}`}>{t("instances.baseUrl")}</Label>
                                <Input id={`baseUrl-${i.id}`} name="baseUrl" defaultValue={i.baseUrl} required />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`apiToken-${i.id}`}>{t("instances.apiTokenKeep")}</Label>
                                <Input id={`apiToken-${i.id}`} name="apiToken" type="password" placeholder="cf_…" />
                              </div>
                            </ActionForm>
                          </div>
                        </details>
                      </Gate>
                      {multiServer && (
                        <p className="text-xs text-muted-foreground">{t("instances.multiServerNote")}</p>
                      )}
                    </div>

                    {multiServer ? (
                      // One block per server: agent status + its own schedule.
                      <div className="flex flex-col gap-3 border-t pt-3">
                        {servers.map((sv) => {
                          const serverAgents = i.agents.filter((a) => a.serverUuid === sv.uuid);
                          const serverLive = serverAgents.filter(agentOnline).length;
                          const serverStale = serverAgents.length - serverLive;
                          const policy = i.policies.find((p) => p.serverUuid === sv.uuid);
                          return (
                            <div key={sv.uuid} className="rounded-lg border p-3">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <Server className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm font-medium">{sv.name}</span>
                                <Badge tone={statusTone(serverLive > 0 ? "online" : serverStale > 0 ? "offline" : "pending")}>
                                  {serverLive > 0
                                    ? t("instances.badge.agentConnected")
                                    : serverStale > 0
                                      ? t("instances.badge.agentOffline")
                                      : t("instances.badge.noAgentInstalled")}
                                </Badge>
                                {serverLive === 0 && (
                                  <span className="text-xs text-[var(--color-warning)]">{t("instances.runInstallOnHost")}</span>
                                )}
                              </div>
                              <Gate min="admin">
                                {scheduleBlock({
                                  policy,
                                  lastRun: policy ? runByPolicy.get(policy.id) : undefined,
                                  action: setServerSchedule.bind(null, i.id, sv.uuid),
                                  remove: removeServerSchedule.bind(null, i.id, sv.uuid),
                                  emptyLabel: t("instances.schedule.emptyServer"),
                                })}
                              </Gate>
                            </div>
                          );
                        })}
                        <Gate min="admin">
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("instances.serverMapSummary")}</summary>
                            <div className="mt-3 max-w-lg">
                              <ServerMapForm
                                instanceId={i.id}
                                servers={servers}
                                current={(i.serverUuidMap as Record<string, string> | null) ?? {}}
                              />
                            </div>
                          </details>
                        </Gate>
                      </div>
                    ) : (
                      // Single server (or none discovered yet): instance-wide schedule.
                      <Gate min="admin">
                        <div className="border-t pt-3">
                          {scheduleBlock({
                            policy: instancePolicy,
                            lastRun: instancePolicy ? runByPolicy.get(instancePolicy.id) : undefined,
                            action: setInstanceSchedule.bind(null, i.id),
                            remove: removeInstanceSchedule.bind(null, i.id),
                            emptyLabel: t("instances.schedule.emptyInstance"),
                          })}
                        </div>
                      </Gate>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <Gate min="admin">
          <Card className="h-fit lg:w-[360px]">
          <CardHeader>
            <CardTitle>{t("instances.connectTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={connectInstance} submitLabel={t("instances.connectSubmit")}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">{t("instances.name")}</Label>
                <Input id="name" name="name" placeholder="production" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="baseUrl">{t("instances.baseUrl")}</Label>
                <Input id="baseUrl" name="baseUrl" placeholder="https://coolify.example.com" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="apiToken">{t("instances.apiToken")}</Label>
                <Input id="apiToken" name="apiToken" type="password" placeholder="cf_…" required />
              </div>
              <p className="text-xs text-muted-foreground">{t("instances.connectHint")}</p>
            </ActionForm>
          </CardContent>
          </Card>
        </Gate>
      </div>
    </>
  );
}
