"use client";

import { useState, useTransition } from "react";
import { updateResourceHooks } from "@/app/actions";
import { HooksFormView } from "./view";

type Hook = { container: string; pre?: string; post?: string };

/**
 * Per-container pre/post-backup hooks. For a multi-container resource (a
 * docker-compose service, or any resource with several containers) each
 * container gets its own row; otherwise a single "primary container" row.
 */
export function HooksForm({
  resourceId,
  containers,
  hooks,
}: {
  resourceId: string;
  containers: string[];
  hooks: Hook[];
}) {
  const existing = new Map(hooks.map((h) => [h.container, h]));
  // One row per known container, plus any container referenced by an existing
  // hook (so renamed-away hooks aren't lost). Fall back to a single primary row.
  const slots = Array.from(new Set([...containers, ...hooks.map((h) => h.container)]));
  const initial = (slots.length ? slots : [""]).map((c) => ({
    container: c,
    pre: existing.get(c)?.pre ?? "",
    post: existing.get(c)?.post ?? "",
  }));

  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const multi = slots.length > 1;

  const onUpdate = (i: number, field: "pre" | "post", val: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaved(false);
    start(async () => {
      await updateResourceHooks(
        resourceId,
        rows.map((r) => ({ container: r.container, pre: r.pre, post: r.post })),
      );
      setSaved(true);
    });
  };

  return (
    <HooksFormView
      rows={rows}
      multi={multi}
      containersEmpty={containers.length === 0}
      pending={pending}
      saved={saved}
      onUpdate={onUpdate}
      onSubmit={onSubmit}
    />
  );
}
