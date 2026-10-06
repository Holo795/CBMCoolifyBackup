"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setDrillsEnabled } from "@/app/actions";
import { DrillsToggleView } from "./view";

/**
 * Opt-in for the weekly automatic restore drills (each backup-enabled
 * resource's latest snapshot restored into an agent sandbox). Markup in ./view.tsx.
 */
export function DrillsToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  const onToggle = (next: boolean) => {
    setOn(next); // optimistic
    start(async () => {
      const r = await setDrillsEnabled(next);
      if (r?.error) {
        setOn(!next); // revert on failure
        toast.error(r.error);
      } else router.refresh();
    });
  };

  return <DrillsToggleView on={on} pending={pending} onToggle={onToggle} />;
}
