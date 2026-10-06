"use client";

import { type RefObject } from "react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/cn";

export type LogEvent = { ts: string; level: string; message: string; progress: number | null };

/** Presentation only: the live log box. Logic (polling) in ./index.tsx. */
export function LiveLogView({
  live,
  status,
  events,
  timeZone,
  boxRef,
}: {
  live: boolean;
  status: string;
  events: LogEvent[];
  timeZone?: string;
  boxRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  // Job statuses share the snapshot labels; an unknown one shows as sent.
  const statusKey = `snapshots.status.${status}`;
  const statusText = t(statusKey) === statusKey ? status : t(statusKey);
  const progress = [...events].reverse().find((e) => e.progress != null)?.progress ?? null;

  return (
    <div className="overflow-hidden rounded-lg border bg-[#0f1013] text-[#d6d7dc] dark:bg-[#09090b]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-xs text-[#9b9ca6]">
        {live ? (
          <span className="flex items-center gap-1.5 text-[#a5a5f4]">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#7b7bea] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[#7b7bea]" />
            </span>
            {t("components.liveLog.live")}
          </span>
        ) : (
          <span>{t("components.liveLog.finished", { status: statusText })}</span>
        )}
        <span className="tabular">{t("components.liveLog.events", { count: events.length })}</span>
      </div>
      {live && progress != null && (
        <div className="h-0.5 bg-white/5" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-[#7b7bea] transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div ref={boxRef} className="max-h-96 overflow-y-auto p-3 font-mono text-[12px] leading-5">
        {events.length === 0 ? (
          <span className="text-[#6c6d77]">{t("components.liveLog.waiting")}</span>
        ) : (
          events.map((e, i) => (
            // Append-only log: an event's position never changes.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <div key={i} className="flex gap-3">
              <span className="shrink-0 select-none text-[#6c6d77]">
                {new Date(e.ts).toLocaleTimeString("en-GB", { timeZone, hour12: false })}
              </span>
              <span
                className={cn(
                  "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                  e.level === "error" && "text-[#ff8589]",
                  e.level === "warn" && "text-[#ffc46b]",
                  e.level === "debug" && "text-[#8b8c96]",
                )}
              >
                {e.message}
                {e.progress != null && <span className="text-[#6c6d77]"> ({e.progress}%)</span>}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
