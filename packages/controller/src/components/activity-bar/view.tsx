"use client";

import { StatusDot, statusTone } from "@/components/ui";
import { cn, timeAgo } from "@/lib/cn";
import { useT } from "@/components/i18n-provider";
import { Activity, ChevronUp, Loader2, Database, RotateCcw, Copy, ShieldCheck, Scissors, FlaskConical } from "lucide-react";

export type ActivityJob = {
  id: string;
  type: string;
  status: string;
  label: string | null;
  progress: number | null;
  message: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** Running but waiting for the destination's repository, used by these jobs. */
  lockHeldBy: { type: string; label: string | null }[] | null;
};

const TYPE_ICON: Record<string, typeof Database> = {
  backup: Database,
  restore: RotateCcw,
  mirror: Copy,
  "verify-destination": ShieldCheck,
  prune: Scissors,
  "restore-drill": FlaskConical,
};

/** Presentation only: the bottom activity bar + expandable job list. */
export function ActivityBarView({
  jobs,
  active,
  open,
  onToggle,
}: {
  jobs: ActivityJob[];
  active: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const running = active > 0;

  return (
    <div className="relative shrink-0 border-t bg-surface">
      {open && (
        <div
          id="activity-panel"
          className="absolute bottom-full left-0 right-0 max-h-[min(24rem,60dvh)] overflow-auto border-t bg-card shadow-lg animate-[cbm-fade-in_120ms_ease-out]"
        >
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{t("activity.empty")}</p>
          ) : (
            <ul className="divide-y">
              {jobs.map((j) => {
                const Icon = TYPE_ICON[j.type] ?? Activity;
                const live = j.status === "queued" || j.status === "running";
                const holders = j.lockHeldBy?.map((h) => `${t(`activity.type.${h.type}`)}${h.label ? ` · ${h.label}` : ""}`).join(", ");
                const message = holders ? t("activity.lockHeldBy", { jobs: holders }) : j.message;
                return (
                  <li key={j.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-surface text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">
                        <span className="font-medium">{t(`activity.type.${j.type}`)}</span>
                        {j.label && <span className="text-muted-foreground"> · {j.label}</span>}
                      </p>
                      {(live && message) || j.error ? (
                        <p
                          title={j.error ?? message ?? undefined}
                          className={cn("truncate text-xs", j.error ? "text-danger" : holders ? "text-warning" : "text-muted-foreground")}
                        >
                          {j.error ?? message}
                        </p>
                      ) : null}
                    </div>
                    {live && j.progress != null && (
                      <span className="hidden w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                        <span className="block h-1.5 rounded-full bg-accent transition-all" style={{ width: `${j.progress}%` }} />
                      </span>
                    )}
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusDot tone={holders ? "warning" : statusTone(j.status)} pulse={j.status === "running"} />
                      {t(`activity.status.${holders ? "lock" : j.status}`)}
                    </span>
                    <span className="tabular hidden w-20 shrink-0 text-right text-xs text-subtle-foreground sm:block">
                      {timeAgo(new Date(j.finishedAt ?? j.createdAt), t)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="activity-panel"
        className="flex h-8 w-full items-center justify-between px-4 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <span className="flex items-center gap-2">
          {running ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <Activity className="size-3.5" />}
          <span className="font-medium">{running ? t("activity.running", { count: active }) : t("activity.recent")}</span>
        </span>
        <ChevronUp className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        <span className="sr-only">{open ? t("activity.hide") : t("activity.show")}</span>
      </button>
    </div>
  );
}
