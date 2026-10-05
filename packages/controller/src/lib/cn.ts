import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(n: number | bigint): string {
  const bytes = typeof n === "bigint" ? Number(n) : n;
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Absolute date+time formatted in the given IANA timezone (server or client). */
export function formatDateTime(date: Date | string | null | undefined, timeZone?: string): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  // Fixed locale so the server- and client-rendered strings match (no hydration
  // mismatch); en-GB gives an unambiguous 24h day/month/year format.
  return d.toLocaleString("en-GB", { timeZone, hour12: false });
}

export function timeAgo(
  date: Date | string | null | undefined,
  t?: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  // Without a translator (e.g. logs), English.
  const say = (unit: "s" | "m" | "h" | "d", n: number) => (t ? t(`common.ago.${unit}`, { n }) : `${n}${unit} ago`);
  if (s < 0) return t ? t("common.ago.future") : "in the future";
  if (s < 60) return say("s", s);
  if (s < 3600) return say("m", Math.floor(s / 60));
  if (s < 86400) return say("h", Math.floor(s / 3600));
  return say("d", Math.floor(s / 86400));
}
