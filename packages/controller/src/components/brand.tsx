import { cn } from "@/lib/cn";

/** The CBM mark (shield + check) and name. */
export function Brand({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-7 shrink-0">
        <path
          className="fill-accent"
          d="M16 1.5 3.5 6.2v8.6c0 7.6 5.3 13.8 12.5 15.7 7.2-1.9 12.5-8.1 12.5-15.7V6.2L16 1.5Z"
        />
        <path
          d="m10 16.2 4.2 4.2L22 12.4"
          fill="none"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">CBM</span>
          <span className="mt-1 text-[11px] text-muted-foreground">Coolify Backup Manager</span>
        </span>
      )}
    </span>
  );
}
