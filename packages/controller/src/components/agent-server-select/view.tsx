"use client";

import { Badge, Select } from "@/components/ui";
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
      <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        {serverName ?? (serverUuid ? serverUuid.slice(0, 8) : "-")}
        {serverName || serverUuid ? <Badge>{t("components.auto")}</Badge> : null}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <Select
        aria-label={t("agents.server")}
        className="w-40 [&_select]:h-8 [&_select]:text-[13px]"
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
      </Select>
      <Badge tone={serverManual ? "accent" : "neutral"}>{serverManual ? t("components.manual") : t("components.auto")}</Badge>
    </span>
  );
}
