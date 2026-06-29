"use client";

import { type ReactNode } from "react";
import { Button } from "@/components/ui";

/** Presentation only: a button + its inline result message. Logic in ./index.tsx. */
export function ActionButtonView({
  variant,
  size,
  title,
  disabled,
  pending,
  msg,
  onClick,
  children,
}: {
  variant: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size: "sm" | "md" | "icon";
  title?: string;
  disabled: boolean;
  pending: boolean;
  msg: { ok: boolean; text: string } | null;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant={variant} size={size} title={title} disabled={pending || disabled} onClick={onClick}>
        {pending ? "…" : children}
      </Button>
      {msg && (
        <span className={`text-xs ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
