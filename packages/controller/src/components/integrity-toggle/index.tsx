"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setIntegrityCheck, setIntegrityReadWeeks } from "@/app/actions";
import { IntegrityToggleView } from "./view";

/**
 * Per-destination opt-in for the deep integrity check (restic check, daily,
 * all data read in `weeks` weeks / tar re-checksum, weekly). Markup in ./view.tsx.
 */
export function IntegrityToggle({ id, enabled, restic, weeks }: { id: string; enabled: boolean; restic: boolean; weeks: number }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [w, setW] = useState(weeks);
  const [pending, start] = useTransition();

  const onWeeks = (next: number) => {
    const prev = w;
    setW(next);
    start(async () => {
      const r = await setIntegrityReadWeeks(id, next);
      if (r?.error) setW(prev);
      else router.refresh();
    });
  };

  const onToggle = () => {
    const next = !on;
    setOn(next); // optimistic
    start(async () => {
      const r = await setIntegrityCheck(id, next);
      if (r?.error) setOn(!next); // revert on failure
      else router.refresh();
    });
  };

  return <IntegrityToggleView on={on} pending={pending} onToggle={onToggle} restic={restic} weeks={w} onWeeks={onWeeks} />;
}
