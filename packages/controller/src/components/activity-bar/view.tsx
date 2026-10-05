"use client";

import { Badge, statusTone } from "@/components/ui";
import { timeAgo } from "@/lib/cn";
import { useT } from "@/components/i18n-provider";
import { Activity, ChevronUp, ChevronDown, Loader2, Database, RotateCcw, Copy, ShieldCheck } from "lucide-react";

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
};

const TYPE_ICON: Record<string, typeof Database> = {
  backup: Database,
  restore: RotateCcw,
  mirror: Copy,
  "verify-destination": ShieldCheck,
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
    <div className="relative shrink-0 border-t bg-card/60">
      {open && (
        <div className="absolute bottom-full left-0 right-0 max-h-80 overflow-auto border-t bg-card shadow-lg">
          <ul className="divide-y">
            {jobs.map((j) => {
              const Icon = TYPE_ICON[j.type] ?? Activity;
              const live = j.status === "queued" || j.status === "running";
              return (
                <li key={j.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{t(`activity.type.${j.type}`)}</span>
                    {j.label && <span className="text-muted-foreground"> · {j.label}</span>}
                    {live && j.message && <span className="ml-2 truncate text-xs text-muted-foreground">{j.message}</span>}
                  </span>
                  {live && j.progress != null && (
                    <span className="hidden w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                      <span className="block h-1.5 rounded-full bg-accent transition-all" style={{ width: `${j.progress}%` }} />
                    </span>
                  )}
                  <Badge tone={statusTone(j.status)}>{t(`activity.status.${j.status}`)}</Badge>
                  <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:block">
                    {timeAgo(new Date(j.finishedAt ?? j.createdAt))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-label={open ? t("activity.hide") : t("activity.show")}
      >
        <span className="flex items-center gap-2">
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          ) : (
            <Activity className="h-3.5 w-3.5" />
          )}
          <span className="font-medium">
            {running ? t("activity.running", { count: active }) : t("activity.recent")}
          </span>
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
