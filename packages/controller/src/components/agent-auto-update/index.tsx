"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setAgentAutoUpdate } from "@/app/actions";
import { AgentAutoUpdateView } from "./view";

/** Opt-in: agents update themselves to the controller's version. Markup in ./view.tsx. */
export function AgentAutoUpdate({ enabled, version }: { enabled: boolean; version: string }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  const onToggle = (next: boolean) => {
    setOn(next); // optimistic
    start(async () => {
      const r = await setAgentAutoUpdate(next);
      if (r?.error) {
        setOn(!next); // revert on failure
        toast.error(r.error);
      } else router.refresh();
    });
  };

  return <AgentAutoUpdateView on={on} pending={pending} onToggle={onToggle} version={version} />;
}
