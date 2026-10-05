/**
 * Pure helpers for the overview's storage trends. Days are calendar days in the
 * app timezone, generated from the local date (not by subtracting 24h) so DST
 * changes never skip or repeat a day.
 */

/** Calendar day key (YYYY-MM-DD) of `d` in `timeZone`. */
export function dayKey(d: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** The last `days` calendar days ending today in `timeZone`, oldest first. */
export function lastDays(days: number, timeZone: string, now: Date): string[] {
  const [y, m, d] = dayKey(now, timeZone).split("-").map(Number);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  return out;
}

export type DayVolume = { day: string; bytes: number; count: number };

/** Backed-up volume per day over the last `days` days, zero-filled. */
export function dailyVolume(
  rows: Array<{ finishedAt: Date | null; sizeBytes: bigint | number }>,
  days: number,
  timeZone: string,
  now: Date,
): DayVolume[] {
  const keys = lastDays(days, timeZone, now);
  const byDay = new Map<string, DayVolume>(keys.map((k) => [k, { day: k, bytes: 0, count: 0 }]));
  for (const r of rows) {
    if (!r.finishedAt) continue;
    const bucket = byDay.get(dayKey(r.finishedAt, timeZone));
    if (!bucket) continue;
    bucket.bytes += Number(r.sizeBytes);
    bucket.count++;
  }
  return keys.map((k) => byDay.get(k)!);
}
