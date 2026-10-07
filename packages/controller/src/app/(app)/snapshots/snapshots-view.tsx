import { shownStatus } from "@/lib/snapshot-status";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { CONFIG_ONLY_CAPTURE } from "@cbm/shared";
import { PageHeader } from "@/components/page-header";
import { Badge, StatusDot, EmptyState, List, Tooltip, statusTone } from "@/components/ui";
import { retrySnapshot, cancelSnapshot } from "@/app/actions";
import { snapshotDeleteItems } from "@/components/snapshot-delete";
import { ActionButton } from "@/components/action-button";
import { ActionsMenu } from "@/components/actions-menu";
import { RestoreActions } from "@/components/restore-actions";
import { FilterBar } from "@/components/filter-bar";
import { Gate } from "@/components/role-gate";
import { getT, getLocale } from "@/lib/i18n";
import { Pager } from "@/components/pager";
import { formatBytes } from "@/lib/cn";
import { drillTone } from "@/lib/status";
import { modeLabel, captureLabel } from "@/lib/schedule";
import { Archive, RefreshCw, X, ShieldCheck, ExternalLink, Boxes } from "lucide-react";
import { type DESTINATION_SECRETS, type RESOURCE_SECRETS } from "@/lib/public-fields";

type SnapshotRow = Prisma.SnapshotGetPayload<{
  include: {
    resource: { omit: typeof RESOURCE_SECRETS };
    destination: { omit: typeof DESTINATION_SECRETS };
    _count: { select: { artifacts: true; mirrors: true } };
    drills: { select: { status: true } };
  };
}>;

/** Presentation only: the Snapshots list, grouped by day. Data is fetched in ./page.tsx. */
export async function SnapshotsView({
  snapshots,
  liveInstanceIds,
  instances,
  page,
  totalPages,
  total,
  tz,
  statuses,
  query,
}: {
  snapshots: SnapshotRow[];
  liveInstanceIds: Set<string | null>;
  /** Connected instances, offered as "Restore onto" targets (migration). */
  instances: { id: string; name: string }[];
  page: number;
  totalPages: number;
  total: number;
  tz: string;
  statuses: string[];
  query: { q?: string; status?: string };
}) {
  const t = await getT();
  const locale = await getLocale();
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const dayLabel = (key: string, d: Date) =>
    key === today
      ? t("snapshots.today")
      : key === yesterday
        ? t("snapshots.yesterday")
        : new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = (d: Date) => new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);

  // Group consecutive rows by local day (rows are newest first).
  const groups: { key: string; label: string; rows: SnapshotRow[] }[] = [];
  for (const s of snapshots) {
    const at = s.startedAt ?? new Date(0);
    const key = dayKey(at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.rows.push(s);
    else groups.push({ key, label: dayLabel(key, at), rows: [s] });
  }

  const qs = (p: number) =>
    `/snapshots?${new URLSearchParams({ ...(query.q ? { q: query.q } : {}), ...(query.status ? { status: query.status } : {}), page: String(p) })}`;

  const actions = (s: SnapshotRow, hasAgent: boolean) => (
    <Gate min="operator">
      {s.status === "succeeded" && (
        <RestoreActions
          snapshotId={s.id}
          hasAgent={hasAgent}
          instances={instances}
          currentInstanceId={s.resource.instanceId}
          allowNew={!s.resource.coolifyUuid.startsWith("coolify-self")}
          allowInPlace={s.captureMode !== CONFIG_ONLY_CAPTURE}
        />
      )}
      {s.status === "failed" && (
        <ActionButton
          action={retrySnapshot.bind(null, s.id)}
          size="sm"
          successMsg={t("snapshots.retried")}
          disabled={!hasAgent}
          title={hasAgent ? undefined : t("snapshots.noLiveAgent")}
        >
          <RefreshCw /> {t("snapshots.retry")}
        </ActionButton>
      )}
      {s.status === "running" && (
        <ActionButton action={cancelSnapshot.bind(null, s.id)} variant="ghost" size="sm" successMsg={t("snapshots.cancelled")}>
          <X /> {t("common.cancel")}
        </ActionButton>
      )}
      <ActionsMenu
        items={[
          { kind: "link", label: t("snapshots.openSnapshot"), icon: <ExternalLink />, href: `/snapshots/${s.id}` },
          { kind: "link", label: t("snapshots.openResource"), icon: <Boxes />, href: `/resources/${s.resourceId}` },
          { kind: "separator" },
          ...snapshotDeleteItems(
            t,
            { id: s.id, mirrors: s._count.mirrors, protectedDest: s.destination.protected },
            {
              confirmWord: "DELETE",
              title: t("snapshots.deleteTitle"),
              body: (
                <>
                  {t("snapshots.deleteBodyBefore")} <b className="text-foreground">{s.resource.name}</b>{" "}
                  {t("snapshots.deleteBodyAfterName", { size: formatBytes(s.sizeBytes) })}{" "}
                  <b className="text-foreground">{t("snapshots.deleteBodyFiles")}</b> {t("snapshots.deleteBodyEnd")}
                </>
              ),
            },
          ),
        ]}
      />
    </Gate>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("snapshots.title")} description={t("snapshots.description")} />

      <FilterBar
        placeholder={t("snapshots.searchPlaceholder")}
        select={{
          param: "status",
          label: t("snapshots.colStatus"),
          allLabel: t("snapshots.allStatuses"),
          options: statuses.map((st) => ({ value: st, label: t(`snapshots.status.${st}`) })),
        }}
      />

      {snapshots.length === 0 ? (
        <EmptyState icon={<Archive />} title={t("snapshots.emptyTitle")} hint={t("snapshots.emptyHint")} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-2">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-subtle-foreground">{g.label}</h2>
              <List>
                {g.rows.map((s) => {
                  const hasAgent = liveInstanceIds.has(s.resource.instanceId);
                  const drill = s.drills[0];
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface sm:px-5"
                    >
                      <StatusDot tone={statusTone(shownStatus(s))} pulse={s.status === "running"} />
                      <div className="min-w-0 flex-1 basis-48">
                        <div className="flex items-center gap-2">
                          <Link href={`/snapshots/${s.id}`} className="truncate font-medium hover:underline">
                            {s.resource.name}
                          </Link>
                          {shownStatus(s) !== "succeeded" && (
                            <Badge tone={statusTone(shownStatus(s))}>{t(`snapshots.status.${shownStatus(s)}`)}</Badge>
                          )}
                          {drill && drill.status !== "running" && (
                            <Tooltip content={t(`snapshots.drillBadge.${drill.status}`)}>
                              <span tabIndex={0} className="inline-flex">
                                <Badge tone={drillTone(drill.status)}>
                                  <ShieldCheck />
                                  <span className="sr-only">{t(`snapshots.drillBadge.${drill.status}`)}</span>
                                </Badge>
                              </span>
                            </Tooltip>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {modeLabel(s.mode, t)} · {captureLabel(s.captureMode, t)} · {s.destination.name}
                          {s.isMirror && <> · {t("snapshots.mirrorCopy")}</>}
                          {s.status === "succeeded" && <> · {formatBytes(s.sizeBytes)}</>}
                        </p>
                      </div>
                      <span className="tabular min-w-12 shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                        {s.startedAt ? time(s.startedAt) : "-"}
                      </span>
                      <div className="flex shrink-0 items-center justify-end gap-1">{actions(s, hasAgent)}</div>
                    </li>
                  );
                })}
              </List>
            </section>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="tabular">
          {t(total === 1 ? "snapshots.countOne" : "snapshots.countOther", { count: total })}
          {totalPages > 1 && <> · {t("resources.pageIndicator", { page, pages: totalPages })}</>}
        </span>
        <Pager t={t} page={page} totalPages={totalPages} href={qs} />
      </div>
    </div>
  );
}
