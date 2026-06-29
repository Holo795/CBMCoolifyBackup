"use client";

import { useState, useTransition } from "react";
import { updateAgentServer } from "@/app/actions";
import { AgentServerSelectView } from "./view";

type ServerOption = { uuid: string; name: string };

/**
 * Inline control to pin an agent to a Coolify server (manual), or leave it on
 * automatic detection. Only meaningful when an instance spans several servers.
 */
export function AgentServerSelect({
  agentId,
  serverUuid,
  serverName,
  serverManual,
  options,
}: {
  agentId: string;
  serverUuid: string | null;
  serverName: string | null;
  serverManual: boolean;
  options: ServerOption[];
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(serverUuid ?? "");

  const onChange = (v: string) => {
    setValue(v);
    start(() => void updateAgentServer(agentId, v || null));
  };

  return (
    <AgentServerSelectView
      serverUuid={serverUuid}
      serverName={serverName}
      serverManual={serverManual}
      options={options}
      value={value}
      pending={pending}
      onChange={onChange}
    />
  );
}
