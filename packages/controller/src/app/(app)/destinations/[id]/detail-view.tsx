import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from "@/components/ui";
import { formatBytes } from "@/lib/cn";
import { HardDrive, ArrowLeft, Lock, AlertTriangle, Server } from "lucide-react";

export type ServerRow = { key: string; label: string; bytes: number; count: number };
export type ResourceRow = { id: string; bytes: number; count: number; name: string; type?: string | null };

/** Presentation only: the destination-detail markup. Data is fetched in ./page.tsx. */
export function DestinationDetailView({
  name,
  type,
  encryptionEnabled,
  total,
  missingCount,
  showByServer,
  serverRows,
  rows,
}: {
  name: string;
  type: string;
  encryptionEnabled: boolean;
  total: number;
  missingCount: number;
  showByServer: boolean;
  serverRows: ServerRow[];
  rows: ResourceRow[];
}) {
  const max = rows[0]?.bytes || 1;

  return (
    <>
      <Link href="/destinations" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Destinations
      </Link>
      <PageHeader
        title={name}
        description={`${type} · ${formatBytes(total)} across ${rows.length} resource${rows.length === 1 ? "" : "s"}`}
        action={
          encryptionEnabled ? (
            <Badge tone="success">
              <Lock className="h-3 w-3" /> encrypted
            </Badge>
          ) : undefined
        }
      />

      {missingCount > 0 && (
        <Card className="mb-4 border-[var(--color-danger)]/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 text-[var(--color-danger)]" />
            <span><b>{missingCount}</b> backup{missingCount === 1 ? "" : "s"} can no longer be found at this destination (files deleted at rest). They are flagged <Badge tone="danger">missing</Badge> in the snapshots list.</span>
          </CardContent>
        </Card>
      )}

      {showByServer && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Storage by server</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              This local destination is realised per agent - each server holds its own files at the configured path.
            </p>
            <div className="flex flex-col gap-2">
              {serverRows.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{s.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.count} snapshot{s.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatBytes(s.bytes)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Storage by resource</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={<HardDrive className="h-6 w-6" />} title="No backups here yet" hint="Run a backup to this destination to see its breakdown." />
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((r) => {
                const pct = total > 0 ? Math.round((r.bytes / total) * 100) : 0;
                const width = Math.max(2, (r.bytes / max) * 100);
                return (
                  <div key={r.id} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        {r.type && <Badge>{r.type}</Badge>}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {r.count} snapshot{r.count === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatBytes(r.bytes)} <span className="text-xs text-muted-foreground">· {pct}%</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
