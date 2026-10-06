import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, EmptyState } from "@/components/ui";
import { ResourceIcon } from "@/components/resource-icon";
import { getT } from "@/lib/i18n";
import { formatBytes } from "@/lib/cn";
import { HardDrive, Lock, AlertTriangle, Server } from "lucide-react";

export type ServerRow = { key: string; label: string; bytes: number; count: number };
/** `bytes`: on disk where measured (restic), else `logical`. */
export type ResourceRow = { id: string; bytes: number; logical: number; count: number; name: string; type?: string | null };

/** Presentation only: the destination-detail markup. Data is fetched in ./page.tsx. */
export async function DestinationDetailView({
  name,
  type,
  encryptionEnabled,
  total,
  logicalTotal,
  missingCount,
  showByServer,
  serverRows,
  rows,
}: {
  name: string;
  type: string;
  encryptionEnabled: boolean;
  total: number;
  /** restic, once measured: the logical size behind `total` (on disk). */
  logicalTotal: number | null;
  missingCount: number;
  showByServer: boolean;
  serverRows: ServerRow[];
  rows: ResourceRow[];
}) {
  const t = await getT();
  const max = rows[0]?.bytes || 1;
  const serverMax = serverRows[0]?.bytes || 1;
  const snapshots = (n: number) => `${n} ${n === 1 ? t("destinations.word.snapshot") : t("destinations.word.snapshots")}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/destinations", label: t("destinations.title") }}
        title={name}
        badges={
          encryptionEnabled ? (
            <Badge tone="success">
              <Lock /> {t("destinations.badge.encrypted")}
            </Badge>
          ) : undefined
        }
        description={
          logicalTotal != null
            ? t("destinations.detail.subtitleDisk", { type, size: formatBytes(total), count: rows.length, logical: formatBytes(logicalTotal) })
            : rows.length === 1
              ? t("destinations.detail.subtitleOne", { type, size: formatBytes(total), count: rows.length })
              : t("destinations.detail.subtitle", { type, size: formatBytes(total), count: rows.length })
        }
      />

      {missingCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            <b>{missingCount}</b>{" "}
            {missingCount === 1 ? t("destinations.detail.missing.one") : t("destinations.detail.missing.many")}{" "}
            <Badge tone="danger">{t("destinations.detail.missing.badge")}</Badge> {t("destinations.detail.missing.post")}
          </span>
        </div>
      )}

      {showByServer && (
        <Card>
          <CardHeader>
            <CardTitle>{t("destinations.detail.byServer.title")}</CardTitle>
            <CardDescription>{t("destinations.detail.byServer.hint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {serverRows.map((s) => (
              <Bar
                key={s.key}
                icon={
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
                    <Server className="size-4" />
                  </span>
                }
                name={s.label}
                meta={snapshots(s.count)}
                bytes={s.bytes}
                width={(s.bytes / serverMax) * 100}
                pct={total > 0 ? Math.round((s.bytes / total) * 100) : 0}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("destinations.detail.byResource.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              className="border-0 shadow-none"
              icon={<HardDrive />}
              title={t("destinations.detail.empty.title")}
              hint={t("destinations.detail.empty.hint")}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((r) => (
                <Bar
                  key={r.id}
                  href={r.type ? `/resources/${r.id}` : undefined}
                  icon={<ResourceIcon type={r.type ?? ""} />}
                  name={r.name}
                  meta={snapshots(r.count)}
                  bytes={r.bytes}
                  width={(r.bytes / max) * 100}
                  pct={total > 0 ? Math.round((r.bytes / total) * 100) : 0}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** One storage line: icon tile, name, share and a proportional bar. */
function Bar({
  href,
  icon,
  name,
  meta,
  bytes,
  width,
  pct,
}: {
  href?: string;
  icon: React.ReactNode;
  name: string;
  meta: string;
  bytes: number;
  width: number;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="flex min-w-0 items-baseline gap-2">
            {href ? (
              <Link href={href} className="truncate font-medium hover:underline">
                {name}
              </Link>
            ) : (
              <span className="truncate font-medium">{name}</span>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
          </span>
          <span className="tabular shrink-0">
            {formatBytes(bytes)} <span className="text-xs text-muted-foreground">· {pct}%</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, width)}%` }} />
        </div>
      </div>
    </div>
  );
}
