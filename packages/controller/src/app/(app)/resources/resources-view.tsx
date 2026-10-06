import { Fragment } from "react";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { Badge, StatusDot, EmptyState, Table, THead, TH, TR, TD, List, ListItem, Disclosure, Tooltip, buttonClass } from "@/components/ui";
import { backupNow } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { ResourceToggles } from "@/components/resource-toggles";
import { ResourceIcon } from "@/components/resource-icon";
import { FilterBar } from "@/components/filter-bar";
import { Gate } from "@/components/role-gate";
import { getT } from "@/lib/i18n";
import { Pager } from "@/components/pager";
import { resourceStatusLabel, resourceStatusTone } from "@/lib/status";
import { Boxes, Play, Unplug, ChevronRight, Cloud, Server, ExternalLink } from "lucide-react";
import { coolifyResourceUrl } from "@/lib/coolify-link";
import { type INSTANCE_SECRETS } from "@/lib/public-fields";

type ResourceRow = Prisma.ResourceGetPayload<{ include: { instance: { omit: typeof INSTANCE_SECRETS } } }>;
type OrphanedRow = Prisma.ResourceGetPayload<{
  include: { instance: { omit: typeof INSTANCE_SECRETS }; _count: { select: { snapshots: true } } };
}>;

/** Presentation only: the Resources list markup. Data is fetched in ./page.tsx. */
export async function ResourcesView({
  rows,
  orphaned,
  liveInstanceIds,
  total,
  page,
  totalPages,
  q,
  type,
  types,
  instance,
  server,
  group,
  instances,
  servers,
  groupCounts,
}: {
  rows: ResourceRow[];
  orphaned: OrphanedRow[];
  liveInstanceIds: Set<string | null>;
  total: number;
  page: number;
  totalPages: number;
  q?: string;
  type?: string;
  types: string[];
  instance?: string;
  server?: string;
  /** Rows come sorted by this group, with a header per group. */
  group?: "instance" | "server";
  instances: { id: string; name: string }[];
  /** Servers to filter by (those of the selected instance, if any). */
  servers: { value: string; name: string | null; instanceName: string }[];
  /** Resources per group key (all pages). */
  groupCounts: Record<string, number>;
}) {
  const t = await getT();
  const params = { q, type, instance, server, group };
  const qs = (p: number) =>
    `/resources?${new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => !!e[1])),
      page: String(p),
    }).toString()}`;
  const manyInstances = instances.length > 1;

  const subtitle = (r: ResourceRow) =>
    [
      r.projectName || null,
      r.environment && r.environment !== "production" ? r.environment : null,
      // Shown by the group header when grouped by it.
      group ? null : r.instance.name,
      group === "server" ? null : r.serverName,
    ]
      .filter(Boolean)
      .join(" · ");

  // Grouping: a header where the group changes (control planes stay pinned above).
  const groupKey = (r: ResourceRow) =>
    group === "server" ? `${r.instanceId}:${r.serverUuid ?? "none"}` : group === "instance" ? r.instanceId : "";
  const groupLabel = (r: ResourceRow) =>
    group === "server"
      ? [r.serverName ?? t("resources.unknownServer"), manyInstances ? r.instance.name : null].filter(Boolean).join(" · ")
      : r.instance.name;
  const headerBefore = (i: number) => {
    const r = rows[i];
    if (!group || r.coolifyUuid.startsWith("coolify-self")) return null;
    const prev = rows[i - 1];
    if (prev && !prev.coolifyUuid.startsWith("coolify-self") && groupKey(prev) === groupKey(r)) return null;
    const count = groupCounts[groupKey(r)] ?? 0;
    return { label: groupLabel(r), count };
  };
  const GroupIcon = group === "server" ? Server : Cloud;

  // Open the resource in its own Coolify (new tab).
  const coolifyLink = (r: ResourceRow) => (
    <a
      href={coolifyResourceUrl(r.instance.baseUrl, r)}
      target="_blank"
      rel="noopener noreferrer"
      title={t("resources.openInCoolifyOn", { name: r.instance.name })}
      aria-label={t("resources.openInCoolifyOn", { name: r.instance.name })}
      className={buttonClass("ghost", "icon-sm")}
    >
      <ExternalLink />
    </a>
  );

  const backupButton = (r: ResourceRow, agentDown: boolean) => (
    <Gate min="operator">
      <ActionButton
        action={backupNow.bind(null, r.id)}
        variant="secondary"
        size="sm"
        successMsg={t("resources.queued")}
        disabled={agentDown}
        title={agentDown ? t("resources.agentUnavailableRow") : undefined}
      >
        <Play /> {t("resources.backup")}
      </ActionButton>
    </Gate>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("resources.title")} description={t("resources.description")} />

      <FilterBar
        placeholder={t("resources.searchPlaceholder")}
        selects={[
          ...(manyInstances
            ? [
                {
                  param: "instance",
                  label: t("resources.filterInstance"),
                  allLabel: t("resources.allInstances"),
                  options: instances.map((i) => ({ value: i.id, label: i.name })),
                  clears: ["server"],
                },
              ]
            : []),
          ...(servers.length > 1 || server
            ? [
                {
                  param: "server",
                  label: t("resources.filterServer"),
                  allLabel: t("resources.allServers"),
                  options: servers.map((sv) => ({
                    value: sv.value,
                    label: [sv.name ?? t("resources.unknownServer"), manyInstances && !instance ? sv.instanceName : null]
                      .filter(Boolean)
                      .join(" · "),
                  })),
                },
              ]
            : []),
          {
            param: "type",
            label: t("resources.colType"),
            allLabel: t("resources.allTypes"),
            options: types.map((v) => ({ value: v, label: v })),
          },
          ...(manyInstances || servers.length > 1
            ? [
                {
                  param: "group",
                  label: t("resources.groupBy"),
                  allLabel: t("resources.groupNone"),
                  options: [
                    ...(manyInstances ? [{ value: "instance", label: t("resources.groupInstance") }] : []),
                    { value: "server", label: t("resources.groupServer") },
                  ],
                },
              ]
            : []),
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={<Boxes />} title={t("resources.emptyTitle")} hint={t("resources.emptyHint")} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  {/* The name takes what's left and truncates: a long name never widens the table. */}
                  <TH className="w-full">{t("resources.colName")}</TH>
                  <TH className="w-px">{t("resources.colType")}</TH>
                  <TH className="w-px">{t("resources.colStatus")}</TH>
                  <TH className="w-px text-center">{t("resources.colScheduled")}</TH>
                  <TH className="w-px" />
                </tr>
              </THead>
              <tbody>
                {rows.map((r, i) => {
                  const agentDown = !liveInstanceIds.has(r.instanceId);
                  const isControlPlane = r.coolifyUuid.startsWith("coolify-self");
                  const header = headerBefore(i);
                  return (
                    <Fragment key={r.id}>
                      {header && (
                        <tr className="border-b bg-surface">
                          <td colSpan={5} className="px-4 py-2 text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <GroupIcon className="size-3.5" /> {header.label}
                              <span className="tabular text-subtle-foreground">· {header.count}</span>
                            </span>
                          </td>
                        </tr>
                      )}
                      <TR className={agentDown ? "text-muted-foreground" : undefined}>
                        <TD className="max-w-0">
                          <div className="flex items-center gap-3">
                            <ResourceIcon type={r.type} controlPlane={isControlPlane} />
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <Link
                                  href={`/resources/${r.id}`}
                                  title={r.name}
                                  className="truncate font-medium text-foreground hover:underline"
                                >
                                  {r.name}
                                </Link>
                                {isControlPlane && <Badge tone="accent">{t("resources.controlPlane")}</Badge>}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{subtitle(r)}</p>
                            </div>
                          </div>
                        </TD>
                        <TD className="whitespace-nowrap">
                          <span className="font-mono text-xs text-muted-foreground">{r.type}</span>
                        </TD>
                        <TD className="whitespace-nowrap">
                          {agentDown ? (
                            <Tooltip content={t("resources.agentUnavailableRow")}>
                              <span tabIndex={0}>
                                <Badge tone="warning">
                                  <Unplug /> {t("resources.agentUnavailable")}
                                </Badge>
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-[13px]">
                              <StatusDot tone={resourceStatusTone(r.status)} />
                              {resourceStatusLabel(t, r.status)}
                            </span>
                          )}
                        </TD>
                        <TD className="whitespace-nowrap text-center">
                          <Gate min="operator">
                            <ResourceToggles id={r.id} backupEnabled={r.backupEnabled} liveBackup={r.liveBackup} />
                          </Gate>
                        </TD>
                        <TD className="whitespace-nowrap text-right">
                          <span className="inline-flex items-center gap-1">
                            {coolifyLink(r)}
                            {backupButton(r, agentDown)}
                          </span>
                        </TD>
                      </TR>
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {/* Mobile: one row per resource. */}
          <List className="md:hidden">
            {rows.map((r, i) => {
              const agentDown = !liveInstanceIds.has(r.instanceId);
              const isControlPlane = r.coolifyUuid.startsWith("coolify-self");
              const header = headerBefore(i);
              return (
                <Fragment key={r.id}>
                  {header && (
                    <li className="flex items-center gap-1.5 bg-surface px-4 py-2 text-xs font-medium text-muted-foreground">
                      <GroupIcon className="size-3.5" /> {header.label}
                      <span className="tabular text-subtle-foreground">· {header.count}</span>
                    </li>
                  )}
                  <ListItem className="flex-wrap">
                    <ResourceIcon type={r.type} controlPlane={isControlPlane} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/resources/${r.id}`} title={r.name} className="block truncate font-medium hover:underline">
                        {r.name}
                      </Link>
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {agentDown ? (
                          <>
                            <Unplug className="size-3 text-warning" /> {t("resources.agentUnavailable")}
                          </>
                        ) : (
                          <>
                            <StatusDot tone={resourceStatusTone(r.status)} /> {r.type}
                          </>
                        )}
                      </p>
                    </div>
                    {coolifyLink(r)}
                    <Gate min="operator">
                      <ResourceToggles id={r.id} backupEnabled={r.backupEnabled} liveBackup={r.liveBackup} />
                    </Gate>
                  </ListItem>
                </Fragment>
              );
            })}
          </List>
        </>
      )}

      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="tabular">
          {t(total === 1 ? "resources.resourceCountOne" : "resources.resourceCountOther", { count: total })}
          {totalPages > 1 && <> · {t("resources.pageIndicator", { page, pages: totalPages })}</>}
        </span>
        <Pager t={t} page={page} totalPages={totalPages} href={qs} />
      </div>

      {orphaned.length > 0 && (
        <Disclosure summary={t("resources.removedSummary", { count: orphaned.length })}>
          <p className="mb-3 text-xs text-muted-foreground">{t("resources.orphanedNote")}</p>
          <List>
            {orphaned.map((r) => (
              <ListItem key={r.id}>
                <ResourceIcon type={r.type} />
                <div className="min-w-0 flex-1">
                  <Link href={`/resources/${r.id}`} className="block truncate font-medium hover:underline">
                    {r.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.type} ·{" "}
                    {t(r._count.snapshots === 1 ? "resources.snapshotCountOne" : "resources.snapshotCountOther", {
                      count: r._count.snapshots,
                    })}
                  </p>
                </div>
                <Link href={`/resources/${r.id}`} className={buttonClass("ghost", "sm")}>
                  {t("resources.viewRestore")} <ChevronRight />
                </Link>
              </ListItem>
            ))}
          </List>
        </Disclosure>
      )}
    </div>
  );
}
