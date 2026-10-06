"use client";

import { useState, useTransition } from "react";
import { updateResourceHooks } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { toast } from "sonner";
import { HooksFormView, type HookRow } from "./view";

type Hook = { container: string; pre?: string; post?: string; timeoutSec?: number };
type Discovered = { name: string; service?: string };

/**
 * Per-container pre/post-backup hooks. Rows come from the containers the agent
 * currently sees for the resource (refreshed by heartbeats, so they exist before
 * the first backup). A row targets the docker compose SERVICE when the container
 * has one — that name survives redeploys, the container name may not — else the
 * container name. A single-container resource gets one "primary container" row.
 * Existing hooks always keep their row so nothing is lost. Markup in ./view.tsx.
 */
export function HooksForm({ resourceId, containers, hooks }: { resourceId: string; containers: Discovered[]; hooks: Hook[] }) {
  const t = useT();
  // Distinct stable targets → the container names behind each.
  const byTarget = new Map<string, string[]>();
  for (const c of containers) {
    const key = c.service || c.name;
    byTarget.set(key, [...(byTarget.get(key) ?? []), c.name]);
  }
  const multi = byTarget.size > 1;
  const targets = multi ? [...byTarget.keys()] : [""];
  const existing = new Map(hooks.map((h) => [h.container, h]));
  const slots = Array.from(new Set([...targets, ...hooks.map((h) => h.container)]));

  const [rows, setRows] = useState<HookRow[]>(() =>
    slots.map((target) => ({
      target,
      containers: byTarget.get(target) ?? [],
      known: target === "" || byTarget.has(target),
      pre: existing.get(target)?.pre ?? "",
      post: existing.get(target)?.post ?? "",
      timeoutSec: existing.get(target)?.timeoutSec ? String(existing.get(target)!.timeoutSec) : "",
    })),
  );
  const [pending, start] = useTransition();

  const onUpdate = (i: number, field: "pre" | "post" | "timeoutSec", val: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    start(async () => {
      const r = await updateResourceHooks(
        resourceId,
        rows.map((x) => ({ container: x.target, pre: x.pre, post: x.post, timeoutSec: x.timeoutSec })),
      );
      if (r?.error) toast.error(r.error);
      else toast.success(t("resources.hooks.saved"));
    });
  };

  return (
    <HooksFormView
      rows={rows}
      multi={rows.length > 1}
      noneDiscovered={containers.length === 0}
      pending={pending}
      onUpdate={onUpdate}
      onSubmit={onSubmit}
    />
  );
}
