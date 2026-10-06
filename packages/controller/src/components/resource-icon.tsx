import { AppWindow, Database, Layers, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/cn";

/** Icon tile for a resource type (database, app, service, control plane). */
export function ResourceIcon({ type, controlPlane, className }: { type: string; controlPlane?: boolean; className?: string }) {
  const Icon = controlPlane
    ? ShieldCheck
    : /redis|keydb|dragonfly/.test(type)
      ? Zap
      : /postgres|mysql|maria|mongo|clickhouse/.test(type)
        ? Database
        : type === "service"
          ? Layers
          : AppWindow;
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground [&_svg]:size-4",
        controlPlane && "border-accent/30 bg-accent-soft text-accent",
        className,
      )}
    >
      <Icon />
    </span>
  );
}
