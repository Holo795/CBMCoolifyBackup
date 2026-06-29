"use client";

import { useState, useTransition } from "react";
import { revealInstallCommand } from "@/app/actions";
import { RevealInstallView } from "./view";

/**
 * One-time reveal of the agent install command. The plaintext enrollment token
 * only exists in the server action's return value - revealing it rotates the
 * token, so it's shown exactly once and can never be fetched again.
 */
export function RevealInstall({ instanceId, hasToken }: { instanceId: string; hasToken: boolean }) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<{ oneLiner: string; raw: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const onReveal = () =>
    start(async () => {
      const res = await revealInstallCommand(instanceId);
      setData({ oneLiner: res.oneLiner, raw: res.raw });
    });
  const onCopy = (text: string, which: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <RevealInstallView
      data={data}
      pending={pending}
      hasToken={hasToken}
      copied={copied}
      onReveal={onReveal}
      onCopy={onCopy}
      onHide={() => setData(null)}
    />
  );
}
