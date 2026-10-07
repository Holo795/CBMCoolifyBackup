import * as React from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-subtle-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};

export function Badge({
  className,
  tone = "neutral",
  dot,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-xs font-medium [&_svg]:size-3",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

/** A coloured dot, e.g. before a host name. `pulse` marks live activity. */
export function StatusDot({ tone = "neutral", pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden>
      {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", DOTS[tone])} />}
      <span className={cn("relative inline-flex size-2 rounded-full", DOTS[tone])} />
    </span>
  );
}

export function statusTone(status: string): Tone {
  // Failures first: "unhealthy" also contains "heal".
  if (/fail|error|unhealthy|offline|exited|delet|removed|missing|corrupt/i.test(status)) return "danger";
  if (/warn/i.test(status)) return "warning";
  if (/heal|online|succ|passed/i.test(status)) return "success";
  if (/skip|ignor|unknown/i.test(status)) return "neutral";
  if (/run|progress|queue|pend/i.test(status)) return "accent";
  return "neutral";
}
