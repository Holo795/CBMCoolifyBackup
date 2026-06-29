"use client";

import { type RefObject } from "react";

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
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        {live ? (
          <span className="flex items-center gap-1.5 text-[var(--color-accent)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            live
          </span>
        ) : (
          <span>finished - {status}</span>
        )}
        <span>· {events.length} events</span>
      </div>
      <div ref={boxRef} className="max-h-80 overflow-auto whitespace-nowrap rounded-md bg-muted/40 p-3 font-mono text-xs">
        {events.length === 0 ? (
          <span className="text-muted-foreground">Waiting for the agent…</span>
        ) : (
          events.map((e, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground">
                {new Date(e.ts).toLocaleTimeString("en-GB", { timeZone, hour12: false })}
              </span>
              <span
                className={
                  e.level === "error"
                    ? "text-[var(--color-danger)]"
                    : e.level === "warn"
                      ? "text-[var(--color-warning)]"
                      : ""
                }
              >
                {e.message}
                {e.progress != null ? ` (${e.progress}%)` : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
