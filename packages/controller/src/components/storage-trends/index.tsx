import type { DayVolume } from "@/lib/storage-stats";
import { StorageTrendsView } from "./view";

export type StorageData = {
  /** Bytes held by succeeded snapshots across every destination (mirrors included). */
  total: number;
  /** Per-day backed-up volume over the trend window (mirror copies excluded). */
  daily: DayVolume[];
  perDestination: Array<{ id: string; name: string; type: string; engine: string; bytes: number; count: number }>;
};

/**
 * Overview storage card: how much is protected, where it lives, and how much is
 * backed up per day. Derives the scaling here; markup in ./view.tsx.
 */
export function StorageTrends({ data }: { data: StorageData }) {
  const windowTotal = data.daily.reduce((n, d) => n + d.bytes, 0);
  const maxDaily = Math.max(0, ...data.daily.map((d) => d.bytes));
  const destinations = [...data.perDestination].sort((a, b) => b.bytes - a.bytes);
  const maxDest = Math.max(0, ...destinations.map((d) => d.bytes));
  return (
    <StorageTrendsView
      total={data.total}
      windowTotal={windowTotal}
      daily={data.daily}
      maxDaily={maxDaily}
      destinations={destinations}
      maxDest={maxDest}
    />
  );
}
