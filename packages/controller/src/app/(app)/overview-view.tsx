import Link from "next/link";
import { AlertTriangle, ArrowRight, Archive, Boxes, CheckCircle2, Cpu, Server } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, Badge, StatusDot, Stat, EmptyState, buttonClass, statusTone } from "@/components/ui";
import { formatBytes, timeAgo } from "@/lib/cn";
import { getT } from "@/lib/i18n";
import { modeLabel, captureLabel } from "@/lib/schedule";
import { StorageTrends, type StorageData } from "@/components/storage-trends";

export type OverviewCounts = {
  instances: number;
  resources: number;
  enabled: number;
  snapshots: number;
  agentsOnline: number;
  agentsTotal: number;
};

export type OverviewIssues = { failed: number; missing: number; corrupt: number; agentsOffline: number };

export type OverviewSnapshot = {
  id: string;
  mode: string;
  captureMode: string;
  status: string;
  sizeBytes: bigint;
  startedAt: Date | null;
  resource: { name: string };
};

/** Presentation only: the Overview dashboard markup. Data is fetched in ./page.tsx. */
export async function OverviewView({
  counts,
  issues,
  recent,
  storage,
}: {
  counts: OverviewCounts;
  issues: OverviewIssues;
  recent: OverviewSnapshot[];
  storage: StorageData;
}) {
  const t = await getT();
  const plural = (key: string, count: number) => t(`${key}${count > 1 ? "Other" : "One"}`, { count });
  const problems = [
    { n: issues.failed, text: plural("overview.issueFailed", issues.failed), href: "/snapshots" },
    { n: issues.missing, text: plural("overview.issueMissing", issues.missing), href: "/snapshots" },
    { n: issues.corrupt, text: plural("overview.issueCorrupt", issues.corrupt), href: "/snapshots" },
    { n: issues.agentsOffline, text: plural("overview.issueAgents", issues.agentsOffline), href: "/agents" },
  ].filter((p) => p.n > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("overview.title")} description={t("overview.description")} />

      {problems.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-success">{t("overview.healthy")}</p>
            <p className="text-[13px] text-muted-foreground">{t("overview.healthyHint")}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="size-4" /> {t("overview.attention")}
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {problems.map((p) => (
              <li key={p.text} className="flex items-center justify-between gap-3 text-[13px]">
                <span>{p.text}</span>
                <Link href={p.href} className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground hover:underline">
                  {t("overview.review")} <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/resources" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Stat
            className="h-full transition-colors hover:border-border-strong"
            label={t("overview.protected")}
            value={counts.enabled}
            hint={t("overview.protectedHint", { enabled: counts.enabled, total: counts.resources })}
            icon={<Boxes />}
          />
        </Link>
        <Link href="/snapshots" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Stat
            className="h-full transition-colors hover:border-border-strong"
            label={t("overview.storedSnapshots")}
            value={counts.snapshots}
            hint={t("overview.storedHint", { size: formatBytes(storage.total) })}
            icon={<Archive />}
          />
        </Link>
        <Link href="/instances" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Stat
            className="h-full transition-colors hover:border-border-strong"
            label={t("overview.instances")}
            value={counts.instances}
            hint={t("overview.instancesHint", { count: counts.resources })}
            icon={<Server />}
          />
        </Link>
        <Link href="/agents" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Stat
            className="h-full transition-colors hover:border-border-strong"
            label={t("overview.agentsOnline")}
            value={counts.agentsOnline}
            tone={counts.agentsTotal > counts.agentsOnline ? "warning" : undefined}
            hint={t("overview.agentsHint", { online: counts.agentsOnline, total: counts.agentsTotal })}
            icon={<Cpu />}
          />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <StorageTrends data={storage} />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader
            actions={
              <Link href="/snapshots" className={buttonClass("ghost", "xs")}>
                {t("overview.viewAll")} <ArrowRight />
              </Link>
            }
          >
            <CardTitle>{t("overview.recent")}</CardTitle>
          </CardHeader>
          {recent.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={<Archive />} title={t("overview.noSnapshots")} className="py-10" />
            </div>
          ) : (
            <ul className="divide-y border-t">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/snapshots/${s.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                  >
                    <StatusDot tone={statusTone(s.status)} pulse={s.status === "running"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{s.resource.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {modeLabel(s.mode, t)} · {captureLabel(s.captureMode, t)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      {s.status === "succeeded" ? (
                        <span className="tabular text-xs text-muted-foreground">{formatBytes(s.sizeBytes)}</span>
                      ) : (
                        <Badge tone={statusTone(s.status)}>{t(`snapshots.status.${s.status}`)}</Badge>
                      )}
                      <span className="text-xs text-subtle-foreground">{timeAgo(s.startedAt, t)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
