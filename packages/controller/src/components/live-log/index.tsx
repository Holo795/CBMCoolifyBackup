"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveLogView, type LogEvent } from "./view";

export function LiveLog({
  id,
  kind = "snapshot",
  initialStatus,
  timeZone,
}: {
  id: string;
  kind?: "snapshot" | "restore";
  initialStatus: string;
  /** IANA timezone for rendering event times (falls back to the browser's). */
  timeZone?: string;
}) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const refreshed = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/${kind}s/${id}/events`, { cache: "no-store" });
        if (res.ok && active) {
          const data = (await res.json()) as { status: string; events: LogEvent[] };
          setEvents(data.events);
          setStatus(data.status);
          if (data.status === "running") {
            // Keep polling only while the job is still running.
            timer = setTimeout(poll, 1500);
          } else if (!refreshed.current) {
            // Job finished: refresh the server components once so the status
            // badge (server-rendered) flips from "running" without a manual reload.
            refreshed.current = true;
            router.refresh();
          }
          return;
        }
      } catch {
        /* transient */
      }
      if (active) timer = setTimeout(poll, 3000);
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, kind, router]);

  // Auto-scroll to the latest line.
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [events]);

  return <LiveLogView live={status === "running"} status={status} events={events} timeZone={timeZone} boxRef={boxRef} />;
}
