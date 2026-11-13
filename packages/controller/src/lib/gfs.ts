/** Pure grandfather-father-son retention selection (no I/O, easy to test).
 * The newest snapshot is always kept. */

export function computeKeepSet(
  snaps: { id: string; at: Date }[],
  daily: number,
  weekly: number,
  monthly: number,
): Set<string> {
  const keep = new Set<string>();
  const seenDay = new Set<string>();
  const seenWeek = new Set<string>();
  const seenMonth = new Set<string>();

  for (const s of snaps) {
    const d = s.at;
    const dayKey = d.toISOString().slice(0, 10);
    const weekKey = isoWeek(d);
    const monthKey = d.toISOString().slice(0, 7);

    if (seenDay.size < daily && !seenDay.has(dayKey)) {
      seenDay.add(dayKey);
      keep.add(s.id);
    } else if (seenWeek.size < weekly && !seenWeek.has(weekKey)) {
      seenWeek.add(weekKey);
      keep.add(s.id);
    } else if (seenMonth.size < monthly && !seenMonth.has(monthKey)) {
      seenMonth.add(monthKey);
      keep.add(s.id);
    }
  }
  // Never every copy: the newest is kept whatever the counts (a 0/0/0
  // retention saved before it was refused would otherwise delete each backup
  // as soon as it succeeded).
  if (snaps.length > 0) {
    keep.add(snaps.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a)).id);
  }
  return keep;
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
