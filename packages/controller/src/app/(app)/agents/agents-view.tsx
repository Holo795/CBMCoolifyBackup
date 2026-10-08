import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { Badge, Button, StatusDot, EmptyState, Table, THead, TH, TR, TD, List, ListItem, statusTone } from "@/components/ui";
import { deleteAgent, setAgentDefaults, setAgentSettings, updateAgent, updateAllAgents } from "@/app/actions";
import { ActionsMenu } from "@/components/actions-menu";
import { AgentServerSelect } from "@/components/agent-server-select";
import { getT } from "@/lib/i18n";
import { can, requireUser } from "@/lib/session";
import { timeAgo } from "@/lib/cn";
import { ArrowUpCircle, Cpu, Server, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { AGENT_SETTING_DEFAULTS, type AgentSettings } from "@cbm/shared";
import { FormDialog } from "@/components/form-dialog";
import { AgentSettingsFields } from "@/components/agent-settings-fields";
import { parseAgentSettings } from "@/lib/agent-settings";
import { type AGENT_SECRETS, type INSTANCE_SECRETS } from "@/lib/public-fields";
import { ActionButton } from "@/components/action-button";
import { AgentAutoUpdate } from "@/components/agent-auto-update";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { CBM_VERSION, type AgentUpdateState } from "@/lib/agent-update";

type AgentRow = Prisma.AgentGetPayload<{ omit: typeof AGENT_SECRETS; include: { instance: { omit: typeof INSTANCE_SECRETS } } }>;
export type AgentItem = {
  agent: AgentRow;
  options: { uuid: string; name: string }[];
  update: AgentUpdateState;
  /** An update job is queued or running. */
  updating: boolean;
  /** The last update failed (its error), else null. */
  updateError: string | null;
};

/** Presentation only: the Agents list markup. Data is fetched in ./page.tsx. */
export async function AgentsView({
  items,
  defaults,
  autoUpdate,
}: {
  items: AgentItem[];
  defaults: AgentSettings;
  autoUpdate: boolean;
}) {
  const t = await getT();
  const isAdmin = can(await requireUser(), "admin");
  const updatable = items.filter((it) => it.update.kind === "update" && !it.updating);
  // What an agent gets when it doesn't override a setting.
  const inherited = { ...AGENT_SETTING_DEFAULTS, ...defaults };

  const updateAllButton =
    isAdmin && updatable.length > 0 ? (
      <ActionButton
        action={updateAllAgents}
        variant="secondary"
        size="md"
        confirm={t("agents.update.allConfirm", { count: updatable.length, version: CBM_VERSION })}
      >
        <ArrowUpCircle /> {t("agents.update.all", { count: updatable.length })}
      </ActionButton>
    ) : null;
  const defaultsButton = isAdmin ? (
    <FormDialog
      trigger={
        <Button>
          <SlidersHorizontal /> {t("agents.settings.defaultsButton")}
        </Button>
      }
      side="right"
      title={t("agents.settings.defaultsTitle")}
      description={t("agents.settings.defaultsDesc")}
      action={setAgentDefaults}
      submitLabel={t("common.save")}
    >
      <AgentSettingsFields values={defaults} inherited={AGENT_SETTING_DEFAULTS} />
    </FormDialog>
  ) : null;
  const settingsButton = (a: AgentRow) => {
    const own = parseAgentSettings(a.settings);
    return (
      <FormDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={t("agents.settings.agentButton")}>
            <Settings2 />
          </Button>
        }
        side="right"
        title={t("agents.settings.agentTitle", { host: a.hostname })}
        description={t("agents.settings.agentDesc")}
        action={setAgentSettings.bind(null, a.id)}
        submitLabel={t("common.save")}
      >
        <AgentSettingsFields
          values={own}
          inherited={inherited}
          locked={a.settingsLocked}
          inEffect={a.settingsInEffect ? parseAgentSettings(a.settingsInEffect) : null}
        />
      </FormDialog>
    );
  };
  // "2 at once · auto" from what the agent reports (older agents report nothing).
  const summary = (a: AgentRow) => {
    const s = a.settingsInEffect ? parseAgentSettings(a.settingsInEffect) : null;
    if (!s?.concurrency) return null;
    return `${t("agents.settings.jobs", { count: s.concurrency })} · ${s.stagingMode ?? "auto"}${s.freezeMethod === "cgroup" ? " · cgroup" : ""}`;
  };
  const isCustom = (a: AgentRow) => Object.keys(parseAgentSettings(a.settings)).length > 0;
  // Where the agent stands against the controller's version.
  const updateBadge = ({ update, updating, updateError }: AgentItem) => {
    if (updating) return <Badge tone="accent">{t("agents.update.updating")}</Badge>;
    if (update.kind === "update" || update.kind === "offline")
      return (
        <>
          <Badge tone="warning" title={update.kind === "offline" ? t("agents.update.offline") : undefined}>
            {t("agents.update.available", { version: CBM_VERSION })}
          </Badge>
          {updateError !== null && (
            <Badge tone="danger" title={updateError}>
              {t("agents.update.lastFailed")}
            </Badge>
          )}
        </>
      );
    if (update.kind === "manual") {
      const hint =
        update.reason === "old"
          ? t("agents.update.manualOld")
          : update.reason === "compose"
            ? t("agents.update.manualCompose")
            : t("agents.update.manualNative");
      return (
        <Badge tone="warning" title={hint}>
          {t("agents.update.available", { version: CBM_VERSION })} · {t("agents.update.manual")}
        </Badge>
      );
    }
    if (update.kind === "newer") return <Badge tone="neutral">{t("agents.update.newer")}</Badge>;
    return null;
  };

  const status = (a: AgentRow) => (
    <span className="inline-flex items-center gap-2 text-[13px]">
      <StatusDot tone={statusTone(a.status)} pulse={a.status === "online"} />
      {t(`agents.statuses.${a.status}`)}
    </span>
  );
  const instance = (a: AgentRow) =>
    a.instance ? (
      <Link href="/instances" className="text-[13px] hover:underline">
        {a.instance.name}
      </Link>
    ) : (
      <Badge tone="warning">{t("agents.unlinked")}</Badge>
    );
  const server = ({ agent: a, options }: AgentItem) =>
    isAdmin ? (
      <AgentServerSelect
        agentId={a.id}
        serverUuid={a.serverUuid}
        serverName={a.serverName}
        serverManual={a.serverManual}
        options={options}
      />
    ) : (
      <span className="text-[13px] text-muted-foreground">{a.serverName ?? "-"}</span>
    );
  const menu = ({ agent: a, update, updating }: AgentItem) =>
    isAdmin ? (
      <span className="inline-flex items-center gap-0.5">
        {settingsButton(a)}
        <ActionsMenu
        items={[
          ...(update.kind === "update" && !updating
            ? [
                {
                  label: t("agents.update.action", { version: CBM_VERSION }),
                  icon: <ArrowUpCircle />,
                  action: updateAgent.bind(null, a.id),
                  confirm: t("agents.update.confirm", { host: a.hostname, version: CBM_VERSION }),
                },
                { kind: "separator" as const },
              ]
            : []),
          {
            kind: "delete",
            label: t("common.delete"),
            icon: <Trash2 />,
            action: deleteAgent.bind(null, a.id),
            confirmWord: a.hostname,
            title: t("agents.remove.title", { host: a.hostname }),
            body: (
              <>
                {t("agents.remove.bodyBefore")}
                <b className="text-foreground">{a.hostname}</b>
                {t("agents.remove.bodyAfter")}
              </>
            ),
          },
        ]}
        />
      </span>
    ) : null;
  const hostTile = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
      <Cpu className="size-4" />
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("agents.title")}
        description={t("agents.description")}
        action={
          isAdmin ? (
            <span className="flex flex-wrap items-center gap-2">
              {updateAllButton}
              {defaultsButton}
            </span>
          ) : null
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={<Cpu />} title={t("agents.empty.title")} hint={t("agents.empty.hint")} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>{t("agents.host")}</TH>
                  <TH>{t("agents.status")}</TH>
                  <TH>{t("agents.instance")}</TH>
                  <TH>{t("agents.server")}</TH>
                  <TH className="text-right">{t("agents.containers")}</TH>
                  <TH>{t("agents.lastSeen")}</TH>
                  {isAdmin && <TH className="w-px" />}
                </tr>
              </THead>
              <tbody>
                {items.map((it) => {
                  const a = it.agent;
                  return (
                    <TR key={a.id}>
                      <TD>
                        <div className="flex items-center gap-3">
                          {hostTile}
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-medium">
                              {a.hostname}
                              {isCustom(a) && <Badge tone="accent">{t("agents.settings.custom")}</Badge>}
                              {updateBadge(it)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {a.version && <>v{a.version} · </>}
                              {t("agents.docker")} {a.dockerVersion ?? "-"}
                              {summary(a) && <> · {summary(a)}</>}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD>{status(a)}</TD>
                      <TD>{instance(a)}</TD>
                      <TD>{server(it)}</TD>
                      <TD className="tabular text-right text-[13px] text-muted-foreground">{a.containers ?? 0}</TD>
                      <TD className="whitespace-nowrap text-[13px] text-muted-foreground">{timeAgo(a.lastSeenAt, t)}</TD>
                      {isAdmin && <TD className="text-right">{menu(it)}</TD>}
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </div>

          <List className="md:hidden">
            {items.map((it) => {
              const a = it.agent;
              return (
                <ListItem key={a.id} className="flex-col items-stretch gap-3">
                  <div className="flex items-center gap-3">
                    {hostTile}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.hostname}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.version && <>v{a.version} · </>}
                        {t("agents.containersCount", { count: a.containers ?? 0 })} · {t("agents.seen", { time: timeAgo(a.lastSeenAt, t) })}
                      </p>
                    </div>
                    {menu(it)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {updateBadge(it)}
                    {status(a)}
                    {instance(a)}
                    {server(it)}
                  </div>
                </ListItem>
              );
            })}
          </List>
        </>
      )}

      {isAdmin && (
        <Card id="agent-updates" className="scroll-mt-8">
          <CardHeader>
            <CardTitle>{t("agents.update.autoTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentAutoUpdate enabled={autoUpdate} version={CBM_VERSION} />
          </CardContent>
        </Card>
      )}

      <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
        <Server className="mt-0.5 size-4 shrink-0" />
        <span>
          {t("agents.footer.before")}
          <Link href="/instances" className="font-medium text-accent hover:underline">
            {t("agents.footer.link")}
          </Link>
          {t("agents.footer.after")}
        </span>
      </p>
    </div>
  );
}
