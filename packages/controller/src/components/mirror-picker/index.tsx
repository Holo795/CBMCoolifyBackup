"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setDestinationMirror } from "@/app/actions";
import { MirrorPickerView } from "./view";

/**
 * Pick the second destination that this one mirrors every backup to (redundancy).
 * Markup in ./view.tsx.
 */
export function MirrorPicker({
  id,
  current,
  candidates,
}: {
  id: string;
  current: string | null;
  /** Other destinations that can be mirror targets. */
  candidates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();

  const onChange = (next: string) => {
    const prev = value;
    setValue(next);
    start(async () => {
      const r = await setDestinationMirror(id, next || null);
      if (r?.error) {
        setValue(prev); // revert
        toast.error(r.error);
      } else {
        router.refresh();
      }
    });
  };

  return <MirrorPickerView value={value} pending={pending} candidates={candidates} onChange={onChange} />;
}
