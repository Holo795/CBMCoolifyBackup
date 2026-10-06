import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui";
import { formatBytes } from "@/lib/cn";
import { getT, getLocale } from "@/lib/i18n";
import type { DayVolume } from "@/lib/storage-stats";

/** Presentation only: the overview storage card. Scaling is derived in ./index.tsx. */
export async function StorageTrendsView({
  total,
  logicalTotal,
  windowTotal,
  daily,
  maxDaily,
  destinations,
  maxDest,
}: {
  total: number;
  logicalTotal: number;
  windowTotal: number;
  daily: DayVolume[];
  maxDaily: number;
  destinations: Array<{ id: string; name: string; type: string; engine: string; bytes: number; logical: number; measured: boolean; count: number }>;
  maxDest: number;
}) {
  const t = await getT();
  const locale = await getLocale();
  // Day keys are plain calendar dates; format them as UTC so nothing shifts.
  const fmtDay = (day: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const empty = total === 0 && windowTotal === 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("overview.storageTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="tabular text-2xl font-semibold tracking-tight">{formatBytes(total)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t("overview.storageTotal")}</div>
            {logicalTotal > total && (
              <div className="mt-0.5 text-xs text-subtle-foreground">
                {t("overview.storageLogical", { size: formatBytes(logicalTotal) })}
              </div>
            )}
          </div>
          <div>
            <div className="tabular text-2xl font-semibold tracking-tight">{formatBytes(windowTotal)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t("overview.storageWindow", { days: daily.length })}</div>
          </div>
        </div>

        {empty ? (
          <p className="text-sm text-muted-foreground">{t("overview.storageEmpty")}</p>
        ) : (
          <>
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground">{t("overview.storageDaily")}</p>
              <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={t("overview.storageDaily")}>
                {daily.map((d) => {
                  const pct = maxDaily > 0 ? (d.bytes / maxDaily) * 100 : 0;
                  return (
                    <div
                      key={d.day}
                      title={t(d.count > 1 ? "overview.storageBar" : "overview.storageBarOne", { day: fmtDay(d.day), size: formatBytes(d.bytes), count: d.count })}
                      className={
                        d.bytes > 0
                          ? "flex-1 rounded-t-[3px] bg-accent/75 transition-colors hover:bg-accent"
                          : "flex-1 rounded-t-[3px] bg-muted"
                      }
                      style={{ height: d.bytes > 0 ? `max(${pct}%, 4px)` : "4px" }}
                    />
                  );
                })}
              </div>
              {daily.length > 0 && (
                <div className="mt-2 flex justify-between text-[11px] text-subtle-foreground">
                  <span>{fmtDay(daily[0].day)}</span>
                  <span>{fmtDay(daily[daily.length - 1].day)}</span>
                </div>
              )}
            </div>

            {destinations.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-medium text-muted-foreground">{t("overview.storagePerDestination")}</p>
                <ul className="flex flex-col gap-3">
                  {destinations.map((d) => (
                    <li key={d.id} className="text-[13px]">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                        <Badge>{d.engine === "restic" ? `${d.type} · restic` : d.type}</Badge>
                        <span className="tabular w-20 shrink-0 text-right text-muted-foreground">{formatBytes(d.bytes)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${maxDest > 0 ? Math.max((d.bytes / maxDest) * 100, d.bytes > 0 ? 2 : 0) : 0}%` }}
                        />
                      </div>
                      {d.engine === "restic" && (
                        <p className="mt-1 text-xs text-subtle-foreground">
                          {d.measured
                            ? t("overview.storageDeduped", { size: formatBytes(d.logical) })
                            : t("overview.storageUnmeasured")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-subtle-foreground">{t("overview.storageNote")}</p>
      </CardContent>
    </Card>
  );
}
