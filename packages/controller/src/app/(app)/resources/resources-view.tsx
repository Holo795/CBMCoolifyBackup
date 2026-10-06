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
import { resourceStatusLabel, resourceStatusTone } from "@/lib/status";
import { Boxes, Play, Unplug, ChevronLeft, ChevronRight } from "lucide-react";
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
}) {
  const t = await getT();
  const qs = (p: number) =>
    `/resources?${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}), page: String(p) }).toString()}`;

  const subtitle = (r: ResourceRow) =>
    [r.projectName || null, r.environment && r.environment !== "production" ? r.environment : null, r.instance.name]
      .filter(Boolean)
      .join(" · ");

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
        select={{
          param: "type",
          label: t("resources.colType"),
          allLabel: t("resources.allTypes"),
          options: types.map((v) => ({ value: v, label: v })),
        }}
      />

      {rows.length === 0 ? (
        <EmptyState icon={<Boxes />} title={t("resources.emptyTitle")} hint={t("resources.emptyHint")} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>{t("resources.colName")}</TH>
                  <TH>{t("resources.colType")}</TH>
                  <TH>{t("resources.colStatus")}</TH>
                  <TH className="text-center">{t("resources.colScheduled")}</TH>
                  <TH className="w-px" />
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const agentDown = !liveInstanceIds.has(r.instanceId);
                  const isControlPlane = r.coolifyUuid.startsWith("coolify-self");
                  return (
                    <TR key={r.id} className={agentDown ? "text-muted-foreground" : undefined}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <ResourceIcon type={r.type} controlPlane={isControlPlane} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/resources/${r.id}`} className="truncate font-medium text-foreground hover:underline">
                                {r.name}
                              </Link>
                              {isControlPlane && <Badge tone="accent">{t("resources.controlPlane")}</Badge>}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{subtitle(r)}</p>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <span className="font-mono text-xs text-muted-foreground">{r.type}</span>
                      </TD>
                      <TD>
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
                      <TD className="text-center">
                        <Gate min="operator">
                          <ResourceToggles id={r.id} backupEnabled={r.backupEnabled} liveBackup={r.liveBackup} />
                        </Gate>
                      </TD>
                      <TD className="text-right">{backupButton(r, agentDown)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {/* Mobile: one row per resource. */}
          <List className="md:hidden">
            {rows.map((r) => {
              const agentDown = !liveInstanceIds.has(r.instanceId);
              const isControlPlane = r.coolifyUuid.startsWith("coolify-self");
              return (
                <ListItem key={r.id} className="flex-wrap">
                  <ResourceIcon type={r.type} controlPlane={isControlPlane} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/resources/${r.id}`} className="block truncate font-medium hover:underline">
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
                  <Gate min="operator">
                    <ResourceToggles id={r.id} backupEnabled={r.backupEnabled} liveBackup={r.liveBackup} />
                  </Gate>
                </ListItem>
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
        {totalPages > 1 && (
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={qs(page - 1)} className={buttonClass("secondary", "sm")}>
                <ChevronLeft /> {t("resources.prev")}
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={qs(page + 1)} className={buttonClass("secondary", "sm")}>
                {t("resources.next")} <ChevronRight />
              </Link>
            ) : null}
          </div>
        )}
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
