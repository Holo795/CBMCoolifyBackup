"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateInstanceServerMap } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { ServerMapFormView, type MapRow } from "./view";

/**
 * Restore-time server remap editor for a multi-server TARGET instance:
 * "<source server uuid> → <this instance's server>". Markup in ./view.tsx.
 */
export function ServerMapForm({
  instanceId,
  servers,
  current,
}: {
  instanceId: string;
  /** This instance's servers (remap targets). */
  servers: { uuid: string; name: string }[];
  current: Record<string, string>;
}) {
  const router = useRouter();
  const t = useT();
  const [rows, setRows] = useState<MapRow[]>(() => {
    const existing = Object.entries(current).map(([source, target]) => ({ source, target }));
    return existing.length ? existing : [{ source: "", target: servers[0]?.uuid ?? "" }];
  });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const setRow = (i: number, row: MapRow) => setRows((rs) => rs.map((r, j) => (j === i ? row : r)));
  const addRow = () => setRows((rs) => [...rs, { source: "", target: servers[0]?.uuid ?? "" }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const onSave = () =>
    start(async () => {
      const map = Object.fromEntries(rows.filter((r) => r.source.trim() && r.target).map((r) => [r.source.trim(), r.target]));
      const r = await updateInstanceServerMap(instanceId, map);
      setMsg(r?.error ?? t("instances.serverMap.saved"));
      setTimeout(() => setMsg(null), 4000);
      if (!r?.error) router.refresh();
    });

  return (
    <ServerMapFormView
      rows={rows}
      servers={servers}
      pending={pending}
      msg={msg}
      onRowChange={setRow}
      onAddRow={addRow}
      onRemoveRow={removeRow}
      onSave={onSave}
    />
  );
}
