"use client";

import { Badge } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

type ServerOption = { uuid: string; name: string };

/** Presentation only: the server pin control (read-only or a select). Logic in ./index.tsx. */
export function AgentServerSelectView({
  serverUuid,
  serverName,
  serverManual,
  options,
  value,
  pending,
  onChange,
}: {
  serverUuid: string | null;
  serverName: string | null;
  serverManual: boolean;
  options: ServerOption[];
  value: string;
  pending: boolean;
  onChange: (v: string) => void;
}) {
  const t = useT();
  // Nothing to choose between: just show what was detected (or a dash).
  if (options.length <= 1 && !serverManual) {
    return (
      <span className="text-muted-foreground">
        {serverName ?? (serverUuid ? serverUuid.slice(0, 8) : "-")}
        {serverName || serverUuid ? (
          <Badge tone="neutral" className="ml-2">
            {t("components.auto")}
          </Badge>
        ) : null}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <select
        className="rounded-md border bg-transparent px-2 py-1 text-sm"
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("components.autoDetect")}</option>
        {options.map((o) => (
          <option key={o.uuid} value={o.uuid}>
            {o.name}
          </option>
        ))}
      </select>
      <Badge tone={serverManual ? "accent" : "neutral"}>{serverManual ? "manual" : "auto"}</Badge>
    </span>
  );
}
