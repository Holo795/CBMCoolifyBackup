"use client";

import { useId } from "react";
import { Switch, SwitchRow, Tooltip } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the per-resource backup switches. Logic in ./index.tsx. */
export function ResourceTogglesView({
  verbose,
  enabled,
  live,
  disabled,
  onEnabledChange,
  onLiveChange,
}: {
  verbose: boolean;
  enabled: boolean;
  live: boolean;
  disabled?: boolean;
  onEnabledChange: (v: boolean) => void;
  onLiveChange: (v: boolean) => void;
}) {
  const t = useT();
  const id = useId();

  if (verbose) {
    return (
      <div className="flex flex-col gap-5">
        <SwitchRow
          id={`${id}-enabled`}
          label={t("resources.toggles.enabledLabel")}
          description={t("resources.toggles.enabledDesc")}
          checked={enabled}
          onCheckedChange={onEnabledChange}
          disabled={disabled}
        />
        <SwitchRow
          id={`${id}-live`}
          label={t("resources.toggles.liveLabel")}
          description={t("resources.toggles.liveDesc")}
          checked={live}
          onCheckedChange={onLiveChange}
          disabled={disabled}
        />
      </div>
    );
  }

  // Compact (lists): only the scheduled-backups switch; "live" lives on the resource page.
  return (
    <Tooltip content={t("resources.toggles.enabledLabel")}>
      <span className="inline-flex">
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          disabled={disabled}
          aria-label={t("resources.toggles.enabledLabel")}
        />
      </span>
    </Tooltip>
  );
}
