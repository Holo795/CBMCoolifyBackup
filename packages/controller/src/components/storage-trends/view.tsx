import { Card, CardContent, Badge } from "@/components/ui";
import { formatBytes } from "@/lib/cn";
import { getT, getLocale } from "@/lib/i18n";
import type { DayVolume } from "@/lib/storage-stats";

/** Presentation only: the overview storage card. Scaling is derived in ./index.tsx. */
export async function StorageTrendsView({
  total,
  windowTotal,
  daily,
  maxDaily,
  destinations,
  maxDest,
}: {
  total: number;
  windowTotal: number;
  daily: DayVolume[];
  maxDaily: number;
  destinations: Array<{ id: string; name: string; type: string; engine: string; bytes: number; count: number }>;
  maxDest: number;
}) {
  const t = await getT();
  const locale = await getLocale();
  // Day keys are plain calendar dates; format them as UTC so nothing shifts.
  const fmtDay = (day: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const empty = total === 0 && windowTotal === 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-medium leading-none tabular-nums">{formatBytes(total)}</div>
            <div className="mt-1.5 text-xs text-muted-foreground">{t("overview.storageTotal")}</div>
          </div>
          <div>
            <div className="text-2xl font-medium leading-none tabular-nums">{formatBytes(windowTotal)}</div>
            <div className="mt-1.5 text-xs text-muted-foreground">{t("overview.storageWindow", { days: daily.length })}</div>
          </div>
        </div>

        {empty ? (
          <p className="text-sm text-muted-foreground">{t("overview.storageEmpty")}</p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("overview.storageDaily")}</p>
              <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={t("overview.storageDaily")}>
                {daily.map((d) => {
                  const pct = maxDaily > 0 ? (d.bytes / maxDaily) * 100 : 0;
                  return (
                    <div
                      key={d.day}
                      title={t(d.count > 1 ? "overview.storageBar" : "overview.storageBarOne", { day: fmtDay(d.day), size: formatBytes(d.bytes), count: d.count })}
                      className="flex-1 rounded-sm bg-accent/70 transition-colors hover:bg-accent"
                      style={{ height: d.bytes > 0 ? `max(${pct}%, 3px)` : "1px", opacity: d.bytes > 0 ? 1 : 0.35 }}
                    />
                  );
                })}
              </div>
              {daily.length > 0 && (
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{fmtDay(daily[0].day)}</span>
                  <span>{fmtDay(daily[daily.length - 1].day)}</span>
                </div>
              )}
            </div>

            {destinations.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("overview.storagePerDestination")}</p>
                <ul className="flex flex-col gap-2.5">
                  {destinations.map((d) => (
                    <li key={d.id} className="text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                        <Badge>{d.type}</Badge>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(d.bytes)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${maxDest > 0 ? Math.max((d.bytes / maxDest) * 100, d.bytes > 0 ? 2 : 0) : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <p className="text-[11px] text-muted-foreground">{t("overview.storageNote")}</p>
      </CardContent>
    </Card>
  );
}
