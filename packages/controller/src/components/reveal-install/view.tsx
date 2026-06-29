"use client";

import { Button } from "@/components/ui";
import { KeyRound, Copy, Check, AlertTriangle, Terminal } from "lucide-react";

/** Presentation only: the reveal button + revealed command panel. Logic in ./index.tsx. */
export function RevealInstallView({
  data,
  pending,
  hasToken,
  copied,
  onReveal,
  onCopy,
  onHide,
}: {
  data: { oneLiner: string; raw: string } | null;
  pending: boolean;
  hasToken: boolean;
  copied: string | null;
  onReveal: () => void;
  onCopy: (text: string, which: string) => void;
  onHide: () => void;
}) {
  if (!data) {
    return (
      <Button size="sm" variant="outline" onClick={onReveal} disabled={pending}>
        <KeyRound className="h-3.5 w-3.5" />{" "}
        {pending ? "Generating…" : hasToken ? "Reveal new install command" : "Reveal install command"}
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-start gap-2 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2.5 text-xs">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
        <span>
          Copy this now - the token is shown <b>once</b> and can&apos;t be retrieved later. Revealing{" "}
          <b>rotates the enrollment token</b>: the previous command no longer works for new installs. An agent already
          running keeps working with its session token, but will need this new command if it&apos;s restarted /
          reconfigured.
        </span>
      </div>

      <div className="flex items-start gap-2">
        <pre className="flex-1 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed">{data.oneLiner}</pre>
        <Button size="sm" variant="outline" onClick={() => onCopy(data.oneLiner, "one")} aria-label="Copy command">
          {copied === "one" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          <Terminal className="mr-1 inline h-3.5 w-3.5" />
          Prefer a raw docker run (no curl | sh)
        </summary>
        <div className="mt-2 flex items-start gap-2">
          <pre className="flex-1 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed">{data.raw}</pre>
          <Button size="sm" variant="outline" onClick={() => onCopy(data.raw, "raw")} aria-label="Copy docker run">
            {copied === "raw" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </details>

      <button type="button" className="self-start text-xs text-muted-foreground hover:text-foreground" onClick={onHide}>
        Hide
      </button>
    </div>
  );
}
