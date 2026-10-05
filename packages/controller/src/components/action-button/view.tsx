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
    <span className="relative inline-flex items-center">
      <Button type="button" variant={variant} size={size} title={title} disabled={pending || disabled} onClick={onClick}>
        {pending ? "…" : children}
      </Button>
      {/* Floats out of flow so the result never shifts the surrounding layout. */}
      {msg && (
        <span
          className={`pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-card px-2 py-0.5 text-xs shadow-sm ${
            msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
          }`}
        >
          {msg.text}
        </span>
      )}
    </span>
  );
}
