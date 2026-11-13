/**
 * Which snapshots a retention keeps (pure, no I/O). Like `restic forget`:
 * each rule keeps the newest snapshot of each of its last N periods (hours,
 * days, ISO weeks, months, years), independently, and the snapshots kept are
 * the union - plus the N newest for `last`, and always the newest one.
 * Periods are counted in the configured timezone.
 *
 * Before 2.8.0 the rules were chained (a snapshot taken for the days wasn't
 * looked at for the weeks, and the second of a day took a weekly slot), there
 * was no hourly rule, and days were UTC days.
 */
export type KeepRules = {
  last?: number;
  hourly?: number;
  daily: number;
  weekly: number;
  monthly: number;
  yearly?: number;
};

type Unit = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

export function computeKeepSet(snaps: { id: string; at: Date }[], rules: KeepRules, timeZone = "UTC"): Set<string> {
  const keep = new Set<string>();
  const sorted = [...snaps].sort((a, b) => b.at.getTime() - a.at.getTime());
  for (const s of sorted.slice(0, Math.max(0, rules.last ?? 0))) keep.add(s.id);
  for (const unit of ["hourly", "daily", "weekly", "monthly", "yearly"] as const) {
    const n = rules[unit] ?? 0;
    if (n <= 0) continue;
    const seen = new Set<string>();
    for (const s of sorted) {
      const key = periodKey(s.at, unit, timeZone);
      if (seen.has(key)) continue;
      if (seen.size >= n) break;
      seen.add(key);
      keep.add(s.id);
    }
  }
  // Never every copy: a retention of all zeros saved before it was refused.
  if (sorted.length > 0) keep.add(sorted[0]!.id);
  return keep;
}

/** Whether a set of rules keeps anything besides the newest snapshot. */
export function keepsSomething(rules: KeepRules): boolean {
  return (rules.last ?? 0) + (rules.hourly ?? 0) + rules.daily + rules.weekly + rules.monthly + (rules.yearly ?? 0) > 0;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function wall(d: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  let fmt = fmtCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" });
    fmtCache.set(timeZone, fmt);
  }
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24 };
}

export function periodKey(d: Date, unit: Unit, timeZone: string): string {
  const w = wall(d, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (unit) {
    case "hourly":
      return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}`;
    case "daily":
      return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
    case "weekly":
      return isoWeek(new Date(Date.UTC(w.year, w.month - 1, w.day)));
    case "monthly":
      return `${w.year}-${pad(w.month)}`;
    case "yearly":
      return String(w.year);
  }
}

export function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${date.getUTCFullYear()}-W${week}`;
}
