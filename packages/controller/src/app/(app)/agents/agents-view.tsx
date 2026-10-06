import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { Badge, StatusDot, EmptyState, Table, THead, TH, TR, TD, List, ListItem, statusTone } from "@/components/ui";
import { deleteAgent } from "@/app/actions";
import { ActionsMenu } from "@/components/actions-menu";
import { AgentServerSelect } from "@/components/agent-server-select";
import { getT } from "@/lib/i18n";
import { can, requireUser } from "@/lib/session";
import { timeAgo } from "@/lib/cn";
import { Cpu, Server, Trash2 } from "lucide-react";
import { type AGENT_SECRETS, type INSTANCE_SECRETS } from "@/lib/public-fields";

type AgentRow = Prisma.AgentGetPayload<{ omit: typeof AGENT_SECRETS; include: { instance: { omit: typeof INSTANCE_SECRETS } } }>;
export type AgentItem = { agent: AgentRow; options: { uuid: string; name: string }[] };

/** Presentation only: the Agents list markup. Data is fetched in ./page.tsx. */
export async function AgentsView({ items }: { items: AgentItem[] }) {
  const t = await getT();
  const isAdmin = can(await requireUser(), "admin");

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
  const menu = (a: AgentRow) =>
    isAdmin ? (
      <ActionsMenu
        items={[
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
    ) : null;
  const hostTile = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
      <Cpu className="size-4" />
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("agents.title")} description={t("agents.description")} />

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
                            <p className="truncate font-medium">{a.hostname}</p>
                            <p className="text-xs text-muted-foreground">
                              {t("agents.docker")} {a.dockerVersion ?? "-"}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD>{status(a)}</TD>
                      <TD>{instance(a)}</TD>
                      <TD>{server(it)}</TD>
                      <TD className="tabular text-right text-[13px] text-muted-foreground">{a.containers ?? 0}</TD>
                      <TD className="whitespace-nowrap text-[13px] text-muted-foreground">{timeAgo(a.lastSeenAt, t)}</TD>
                      {isAdmin && <TD className="text-right">{menu(a)}</TD>}
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
                        {t("agents.containersCount", { count: a.containers ?? 0 })} · {t("agents.seen", { time: timeAgo(a.lastSeenAt, t) })}
                      </p>
                    </div>
                    {menu(a)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
