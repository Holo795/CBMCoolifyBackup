"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setIntegrityCheck } from "@/app/actions";
import { IntegrityToggleView } from "./view";

/**
 * Per-destination opt-in for the weekly deep integrity check (restic check /
 * tar re-checksum). Markup in ./view.tsx.
 */
export function IntegrityToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  const onToggle = () => {
    const next = !on;
    setOn(next); // optimistic
    start(async () => {
      const r = await setIntegrityCheck(id, next);
      if (r?.error) setOn(!next); // revert on failure
      else router.refresh();
    });
  };

  return <IntegrityToggleView on={on} pending={pending} onToggle={onToggle} />;
}
