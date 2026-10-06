import * as React from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  hint,
  icon,
  action,
  className,
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex size-11 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        {hint && <p className="max-w-md text-[13px] leading-5 text-muted-foreground">{hint}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** A key figure: big number, label, optional hint and icon. */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "danger" | "warning" | "success";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        <span>{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>
      <div
        className={cn(
          "tabular text-2xl font-semibold tracking-tight",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Definition list of label/value pairs. */
export function Meta({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 gap-y-2.5 text-sm", className)}>
      {items.map((it, i) => (
        // A fixed list of label/value pairs.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <React.Fragment key={i}>
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 break-words">{it.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border bg-surface px-1 font-sans text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Monospace snippet (ids, paths, commands) that wraps instead of overflowing. */
export function Code({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      className={cn("break-all rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground", className)}
      {...props}
    />
  );
}

/** Collapsible section (native details/summary, keyboard accessible). */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group rounded-lg border bg-surface", className)}>
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0 transition-transform group-open:rotate-90">
          <path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {summary}
      </summary>
      <div className="border-t px-3 py-3">{children}</div>
    </details>
  );
}

/** A set of large radio choices (icon + title + hint), e.g. a destination type. */
export function OptionCards<V extends string>({
  name,
  value,
  onChange,
  options,
  columns = 3,
  label,
}: {
  name: string;
  value: V;
  onChange: (v: V) => void;
  options: { value: V; title: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode }[];
  columns?: 2 | 3;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "relative flex cursor-pointer flex-col gap-1 rounded-lg border bg-card p-3 text-left shadow-sm transition-[border-color,box-shadow]",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked ? "border-accent ring-1 ring-accent" : "hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon && <span className={cn("[&_svg]:size-4", checked ? "text-accent" : "text-muted-foreground")}>{o.icon}</span>}
            <span className="text-[13px] font-medium">{o.title}</span>
            {o.hint && <span className="text-xs leading-4 text-muted-foreground">{o.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}

/** Segmented control (single choice among a few short options). Submits `name` in forms. */
export function Segmented<V extends string>({
  name,
  value,
  onChange,
  options,
  label,
  className,
}: {
  name?: string;
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: React.ReactNode }[];
  label?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1", className)}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "cursor-pointer select-none rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
