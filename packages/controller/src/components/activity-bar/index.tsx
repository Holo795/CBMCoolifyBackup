"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityBarView, type ActivityJob } from "./view";

/**
 * Bottom activity bar: polls the recent agent jobs (backups, restores, mirrors,
 * destination checks) and shows them like Coolify's deployment queue, so a
 * queued job is visible at a glance instead of a layout-shifting inline message.
 * Polls fast while something runs, slowly when idle.
 */
export function ActivityBar() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ActivityJob[]>([]);
  const [open, setOpen] = useState(false);
  const prevActiveRef = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const r = await fetch("/api/jobs/recent", { cache: "no-store" });
        if (r.ok && alive) {
          const data = (await r.json()) as { items: ActivityJob[] };
          setJobs(data.items ?? []);
          const active = (data.items ?? []).filter((j) => j.status === "queued" || j.status === "running").length;
          // When a run just finished, refresh the page data so lists update.
          if (active === 0 && prevActiveRef.current > 0) router.refresh();
          prevActiveRef.current = active;
          schedule(active > 0 ? 2500 : 12000);
          return;
        }
      } catch {
        /* ignore */
      }
      if (alive) schedule(12000);
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [router]);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running").length;

  // Hide entirely until there's any history to show.
  if (jobs.length === 0) return null;

  return <ActivityBarView jobs={jobs} active={active} open={open} onToggle={() => setOpen((v) => !v)} />;
}
