"use client";

import { Button, Input, Label, Badge } from "@/components/ui";
import { useId } from "react";
import { useT } from "@/components/i18n-provider";

export type HookRow = {
  /** "" = primary container; else a compose service or container name. */
  target: string;
  /** Containers currently behind this target. */
  containers: string[];
  /** False when the target matches nothing the agent sees right now. */
  known: boolean;
  pre: string;
  post: string;
  timeoutSec: string;
};

/** Presentation only: per-container hook rows. Logic in ./index.tsx. */
export function HooksFormView({
  rows,
  multi,
  noneDiscovered,
  pending,
  msg,
  onUpdate,
  onSubmit,
}: {
  rows: HookRow[];
  multi: boolean;
  noneDiscovered: boolean;
  pending: boolean;
  msg: { ok: boolean; text: string } | null;
  onUpdate: (i: number, field: "pre" | "post" | "timeoutSec", val: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useT();
  const baseId = useId();
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {rows.map((r, i) => {
        // Every row repeats the same three labels: name the target too.
        const target = r.target || t("resources.hooks.primary");
        return (
        <div key={r.target || "__primary"} className="flex flex-col gap-2">
          {multi && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-medium text-foreground">{target}</span>
              {r.containers.length > 0 && r.containers[0] !== r.target && (
                <span className="truncate font-mono text-[11px] text-muted-foreground">{r.containers.join(", ")}</span>
              )}
              {!r.known && <Badge tone="warning">{t("resources.hooks.notFound")}</Badge>}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_7rem]">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-pre-${i}`}>{t("resources.hooks.pre")}</Label>
              <Input
                id={`${baseId}-pre-${i}`}
                aria-label={`${t("resources.hooks.pre")} - ${target}`}
                value={r.pre}
                onChange={(e) => onUpdate(i, "pre", e.target.value)}
                placeholder="php artisan down"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-post-${i}`}>{t("resources.hooks.post")}</Label>
              <Input
                id={`${baseId}-post-${i}`}
                aria-label={`${t("resources.hooks.post")} - ${target}`}
                value={r.post}
                onChange={(e) => onUpdate(i, "post", e.target.value)}
                placeholder="php artisan up"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-timeout-${i}`}>{t("resources.hooks.timeout")}</Label>
              <Input
                id={`${baseId}-timeout-${i}`}
                aria-label={`${t("resources.hooks.timeout")} - ${target}`}
                type="number"
                min={1}
                max={3600}
                inputMode="numeric"
                value={r.timeoutSec}
                onChange={(e) => onUpdate(i, "timeoutSec", e.target.value)}
                placeholder="300"
                className="text-xs"
              />
            </div>
          </div>
        </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        {multi ? t("resources.hooks.helpMulti") : t("resources.hooks.helpSingle")} {t("resources.hooks.helpRules")}
        {noneDiscovered && ` ${t("resources.hooks.noneDiscovered")}`}
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? t("resources.hooks.saving") : t("resources.hooks.save")}
        </Button>
        {msg && (
          <span className={`text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>{msg.text}</span>
        )}
      </div>
    </form>
  );
}
