import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, Badge, statusTone, EmptyState } from "@/components/ui";
import { deleteAgent } from "@/app/actions";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { AgentServerSelect } from "@/components/agent-server-select";
import { Gate } from "@/components/role-gate";
import { getT } from "@/lib/i18n";
import { timeAgo } from "@/lib/cn";
import { Cpu } from "lucide-react";
import { type AGENT_SECRETS, type INSTANCE_SECRETS } from "@/lib/public-fields";

type AgentRow = Prisma.AgentGetPayload<{ omit: typeof AGENT_SECRETS; include: { instance: { omit: typeof INSTANCE_SECRETS } } }>;
export type AgentItem = { agent: AgentRow; options: { uuid: string; name: string }[] };

/** Presentation only: the Agents list markup. Data is fetched in ./page.tsx. */
export async function AgentsView({ items }: { items: AgentItem[] }) {
  const t = await getT();
  return (
    <>
      <PageHeader
        title={t("agents.title")}
        description={t("agents.description")}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Cpu className="h-6 w-6" />}
          title={t("agents.empty.title")}
          hint={t("agents.empty.hint")}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Desktop: table. Mobile: cards (below). */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("agents.host")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("agents.status")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("agents.instance")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("agents.server")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("agents.docker")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("agents.containers")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("agents.lastSeen")}</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ agent: a, options }) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{a.hostname}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(a.status)}>{t(`agents.statuses.${a.status}`)}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {a.instance ? (
                        <Link href="/instances" className="hover:underline">
                          {a.instance.name}
                        </Link>
                      ) : (
                        <span className="text-[var(--color-warning)]">{t("agents.unlinked")}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Gate min="admin">
                        <AgentServerSelect
                          agentId={a.id}
                          serverUuid={a.serverUuid}
                          serverName={a.serverName}
                          serverManual={a.serverManual}
                          options={options}
                        />
                      </Gate>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.dockerVersion ?? "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{a.containers ?? 0}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(a.lastSeenAt)}</td>
                    <td className="px-4 py-2.5">
                      <Gate min="admin">
                        <ConfirmDeleteButton
                          action={deleteAgent.bind(null, a.id)}
                          confirmWord={a.hostname}
                          title={t("agents.remove.title", { host: a.hostname })}
                          body={
                            <>
                              {t("agents.remove.bodyBefore")}
                              <b>{a.hostname}</b>
                              {t("agents.remove.bodyAfter")}
                            </>
                          }
                        />
                      </Gate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile: one card per agent. */}
            <div className="divide-y md:hidden">
              {items.map(({ agent: a, options }) => (
                <div key={a.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{a.hostname}</span>
                    <Badge tone={statusTone(a.status)}>{t(`agents.statuses.${a.status}`)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t("agents.instance")}:{" "}
                      {a.instance ? (
                        <Link href="/instances" className="text-foreground hover:underline">
                          {a.instance.name}
                        </Link>
                      ) : (
                        <span className="text-[var(--color-warning)]">{t("agents.unlinked")}</span>
                      )}
                    </span>
                    <span>{t("agents.docker")} {a.dockerVersion ?? "-"}</span>
                    <span>{t("agents.containersCount", { count: a.containers ?? 0 })}</span>
                    <span>{t("agents.seen", { time: timeAgo(a.lastSeenAt) })}</span>
                  </div>
                  <Gate min="admin">
                    <div className="flex items-center justify-between gap-2">
                      <AgentServerSelect
                        agentId={a.id}
                        serverUuid={a.serverUuid}
                        serverName={a.serverName}
                        serverManual={a.serverManual}
                        options={options}
                      />
                      <ConfirmDeleteButton
                        action={deleteAgent.bind(null, a.id)}
                        confirmWord={a.hostname}
                        title={t("agents.remove.title", { host: a.hostname })}
                        body={
                          <>
                            {t("agents.remove.bodyBefore")}
                            <b>{a.hostname}</b>
                            {t("agents.remove.bodyAfterShort")}
                          </>
                        }
                      />
                    </div>
                  </Gate>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        {t("agents.footer.before")}
        <Link href="/instances" className="text-accent hover:underline">
          {t("agents.footer.link")}
        </Link>
        {t("agents.footer.after")}
      </p>
    </>
  );
}
