"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setDestinationReadAgent } from "@/app/actions";
import { ReadAgentPickerView } from "./view";

/**
 * Pick the agent that reads a remote destination for test restores, integrity
 * checks and mirror copies (e.g. the one on the host holding the repository).
 * Markup in ./view.tsx.
 */
export function ReadAgentPicker({
  id,
  current,
  agents,
}: {
  id: string;
  current: string | null;
  agents: { id: string; hostname: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();

  const onChange = (next: string) => {
    const prev = value;
    setValue(next);
    start(async () => {
      const r = await setDestinationReadAgent(id, next || null);
      if (r?.error) {
        setValue(prev); // revert
        toast.error(r.error);
      } else {
        router.refresh();
      }
    });
  };

  return <ReadAgentPickerView value={value} pending={pending} agents={agents} onChange={onChange} />;
}
