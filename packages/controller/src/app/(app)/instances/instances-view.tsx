import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { FormDialog } from "@/components/form-dialog";
import { ActionForm } from "@/components/action-form";
import { ScheduleEditor } from "@/components/schedule-form";
import { Card, Field, Input, Button, Badge, StatusDot, EmptyState, Tooltip, Code } from "@/components/ui";
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
import { ActionsMenu, type MenuAction } from "@/components/actions-menu";
import { RevealInstall } from "@/components/reveal-install";
import { ServerMapForm } from "@/components/server-map-form";
import { Gate } from "@/components/role-gate";
import { timeAgo } from "@/lib/cn";
import { can, requireUser } from "@/lib/session";
import { describeCron, cronToFrequency, modeLabel } from "@/lib/schedule";
import { isAgentOnline as agentOnline } from "@/lib/agent-status";
import type { groupServersByInstance } from "@/lib/servers";
import { Server, RefreshCw, Trash2, CalendarClock, ShieldCheck, Pencil, Plus, Terminal, ArrowLeftRight, CalendarX, Check, X } from "lucide-react";
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
  const user = await requireUser();
  const isAdmin = can(user, "admin");

  const connectButton = (
    <FormDialog
      openKey="connect-instance"
      trigger={
        <Button variant="primary">
          <Plus /> {t("instances.connectTitle")}
        </Button>
      }
      title={t("instances.connectTitle")}
      description={t("instances.connectDesc")}
      action={connectInstance}
      submitLabel={t("instances.connectSubmit")}
      successMsg={t("instances.connectedToast")}
    >
      <Field label={t("instances.name")} htmlFor="ci-name">
        <Input id="ci-name" name="name" placeholder="production" required autoFocus />
      </Field>
      <Field label={t("instances.baseUrl")} htmlFor="ci-url">
        <Input id="ci-url" name="baseUrl" placeholder="https://coolify.example.com" required />
      </Field>
      <Field label={t("instances.apiToken")} htmlFor="ci-token" hint={t("instances.connectHint")}>
        <Input id="ci-token" name="apiToken" type="password" placeholder="1|…" autoComplete="off" required />
      </Field>
    </FormDialog>
  );

  /** One schedule row (instance-wide or one server): status, schedule, last run, edit. */
  const scheduleRow = (opts: {
    key: string;
    title: string;
    agent: { live: number; stale: number } | null;
    policy: PolicyWithDest | undefined;
    action: (fd: FormData) => Promise<void | { ok?: boolean; error?: string; detail?: string }>;
    remove?: () => Promise<void>;
  }) => {
    const { policy, agent } = opts;
    const lastRun = policy ? runByPolicy.get(policy.id) : undefined;
    const agentTone = agent ? (agent.live > 0 ? "success" : agent.stale > 0 ? "danger" : "warning") : undefined;
    const agentLabel = agent
      ? agent.live > 0
        ? t("instances.badge.agentConnected")
        : agent.stale > 0
          ? t("instances.badge.agentOffline")
          : t("instances.badge.noAgentInstalled")
      : null;
    return (
      <li key={opts.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Server className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{opts.title}</span>
            {agent && agentTone && (
              <Badge tone={agentTone} dot>
                {agentLabel}
              </Badge>
            )}
          </div>
          {policy ? (
            <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
              <CalendarClock className="size-3.5" />
              <span className="font-medium text-foreground">{describeCron(policy.cron, t, tz)}</span>
              <span>→ {policy.destination.name}</span>
              <span>· {modeLabel(policy.mode, t)}</span>
              {policy.mode === "backup" && (
                <span>
                  ·{" "}
                  {t("instances.schedule.keep", {
                    daily: policy.retentionDaily,
                    weekly: policy.retentionWeekly,
                    monthly: policy.retentionMonthly,
                  })}
                </span>
              )}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] text-warning">
              <CalendarX className="size-3.5" /> {t("instances.schedule.none")}
            </p>
          )}
          {lastRun && (
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>{t("instances.lastRunShort", { time: timeAgo(lastRun.at, t) })}</span>
              <span className="inline-flex items-center gap-1 text-success" title={t("instances.okCount", { count: lastRun.ok })}>
                <Check className="size-3" /> {lastRun.ok}
              </span>
              {lastRun.failed > 0 && (
                <span className="inline-flex items-center gap-1 text-danger" title={t("instances.failedCount", { count: lastRun.failed })}>
                  <X className="size-3" /> {lastRun.failed}
                </span>
              )}
              {lastRun.running > 0 && <span className="text-accent">{t("instances.schedule.running", { count: lastRun.running })}</span>}
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1">
            <ScheduleEditor
              label={policy ? t("instances.scheduleEdit") : t("instances.scheduleSet")}
              title={policy ? t("instances.schedule.edit") : opts.title}
              description={opts.title}
              action={opts.action}
              destinations={destinations}
              submitLabel={policy ? t("instances.schedule.update") : t("instances.schedule.set")}
              variant={policy ? "secondary" : "primary"}
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
            {policy && opts.remove && (
              <ActionsMenu
                items={[{ label: t("instances.removeSchedule"), icon: <CalendarX />, action: opts.remove, successMsg: t("common.done") }]}
              />
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("instances.pageTitle")}
        description={t("instances.pageDescription")}
        action={isAdmin ? connectButton : undefined}
      />

      {instances.length === 0 ? (
        <EmptyState
          icon={<Server />}
          title={t("instances.empty.title")}
          hint={t("instances.empty.hint")}
          action={isAdmin ? connectButton : undefined}
        />
      ) : (
        instances.map((i) => {
          const liveAgents = i.agents.filter(agentOnline).length;
          const staleAgents = i.agents.length - liveAgents;
          const servers = [...(serversByInstance.get(i.id)?.entries() ?? [])].map(([uuid, name]) => ({ uuid, name }));
          const multiServer = servers.length > 1;
          const instancePolicy = i.policies.find((p) => !p.serverUuid);
          const menu: MenuAction[] = isAdmin
            ? [
                {
                  kind: "dialog",
                  label: t("instances.installCommand"),
                  icon: <Terminal />,
                  title: t("instances.installCommand"),
                  description: t("instances.installDesc"),
                  wide: true,
                  content: <RevealInstall instanceId={i.id} hasToken={!!i.enrollTokenSetAt} />,
                },
                {
                  kind: "dialog",
                  label: t("instances.editTitle"),
                  icon: <Pencil />,
                  title: t("instances.editTitle"),
                  description: t("instances.repointHint"),
                  content: (
                    <ActionForm action={repointInstance.bind(null, i.id)} submitLabel={t("instances.repointSubmit")} resetOnSuccess={false}>
                      <Field label={t("instances.baseUrl")}>
                        <Input name="baseUrl" defaultValue={i.baseUrl} required />
                      </Field>
                      <Field label={t("instances.apiTokenKeep")}>
                        <Input name="apiToken" type="password" placeholder="1|…" autoComplete="off" />
                      </Field>
                    </ActionForm>
                  ),
                },
                ...(multiServer
                  ? ([
                      {
                        kind: "dialog",
                        label: t("instances.serverMapTitle"),
                        icon: <ArrowLeftRight />,
                        title: t("instances.serverMapTitle"),
                        wide: true,
                        content: (
                          <ServerMapForm
                            instanceId={i.id}
                            servers={servers}
                            current={(i.serverUuidMap as Record<string, string> | null) ?? {}}
                          />
                        ),
                      },
                    ] satisfies MenuAction[])
                  : []),
                { kind: "separator" },
                {
                  kind: "delete",
                  label: t("common.delete"),
                  icon: <Trash2 />,
                  action: deleteInstance.bind(null, i.id),
                  confirmWord: i.name,
                  title: t("instances.deleteTitle", { name: i.name }),
                  body: t("instances.deleteBody"),
                },
              ]
            : [];

          return (
            <Card key={i.id} className="overflow-hidden">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
                    <Server className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold tracking-tight">{i.name}</h2>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusDot tone={liveAgents > 0 ? "success" : staleAgents > 0 ? "danger" : "warning"} />
                        {t(liveAgents === 1 ? "instances.summary.agentOne" : "instances.summary.agentMany", { count: liveAgents })}
                      </span>
                    </div>
                    <a href={i.baseUrl} target="_blank" rel="noreferrer noopener" className="block truncate font-mono text-xs text-muted-foreground hover:text-foreground">
                      {i.baseUrl}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("instances.summary.resources", { count: i._count.resources })}
                      {servers.length > 0 &&
                        ` · ${t(servers.length === 1 ? "instances.summary.serverOne" : "instances.summary.serverMany", { count: servers.length })}`}{" "}
                      · {t("instances.summary.synced", { time: timeAgo(i.lastSyncedAt, t) })}
                      {i.enrollTokenSetAt && (
                        <>
                          {" "}
                          ·{" "}
                          <Tooltip content={t("instances.enrollTokenTitle")}>
                            <span tabIndex={0}>
                              <Code className="text-[11px]">{i.enrollTokenHint}</Code>
                            </span>
                          </Tooltip>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Gate min="operator">
                    <ActionButton
                      action={backupCoolifyInstance.bind(null, i.id)}
                      size="sm"
                      successMsg={t("instances.backupQueued")}
                      disabled={liveAgents === 0}
                      title={liveAgents === 0 ? t("instances.noLiveAgentTitle") : undefined}
                    >
                      <ShieldCheck /> {t("instances.backupCoolify")}
                    </ActionButton>
                  </Gate>
                  {isAdmin && (
                    <form action={syncInstanceAction.bind(null, i.id)}>
                      <Tooltip content={t("instances.sync")}>
                        <Button type="submit" size="icon-sm" variant="ghost" aria-label={t("instances.sync")}>
                          <RefreshCw />
                        </Button>
                      </Tooltip>
                    </form>
                  )}
                  {menu.length > 0 && <ActionsMenu items={menu} />}
                </div>
              </div>

              {(isAdmin || multiServer) && (
                <div className="border-t bg-surface/60">
                  {multiServer && (
                    <p className="px-5 pt-3 text-xs text-muted-foreground">{t("instances.multiServerNote")}</p>
                  )}
                  <ul className="divide-y">
                    {multiServer
                      ? servers.map((sv) => {
                          const serverAgents = i.agents.filter((a) => a.serverUuid === sv.uuid);
                          const live = serverAgents.filter(agentOnline).length;
                          return scheduleRow({
                            key: sv.uuid,
                            title: sv.name,
                            agent: { live, stale: serverAgents.length - live },
                            policy: i.policies.find((p) => p.serverUuid === sv.uuid),
                            action: setServerSchedule.bind(null, i.id, sv.uuid),
                            remove: removeServerSchedule.bind(null, i.id, sv.uuid),
                          });
                        })
                      : scheduleRow({
                          key: "instance",
                          title: t("instances.instanceSchedule"),
                          agent: { live: liveAgents, stale: staleAgents },
                          policy: instancePolicy,
                          action: setInstanceSchedule.bind(null, i.id),
                          remove: removeInstanceSchedule.bind(null, i.id),
                        })}
                  </ul>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
