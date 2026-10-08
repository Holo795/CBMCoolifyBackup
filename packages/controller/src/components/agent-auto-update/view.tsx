"use client";

import { SwitchRow } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the agents' automatic update toggle. Logic in ./index.tsx. */
export function AgentAutoUpdateView({
  on,
  pending,
  onToggle,
  version,
}: {
  on: boolean;
  pending: boolean;
  onToggle: (v: boolean) => void;
  version: string;
}) {
  const t = useT();
  return (
    <SwitchRow
      id="agent-auto-update"
      label={t("agents.update.autoLabel")}
      description={t("agents.update.autoHint", { version })}
      checked={on}
      onCheckedChange={onToggle}
      disabled={pending}
    />
  );
}
