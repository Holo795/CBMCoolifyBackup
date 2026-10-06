"use client";

import { type ReactNode } from "react";
import { Button, Tooltip, type ButtonSize, type ButtonVariant } from "@/components/ui";

/** Presentation only: the action button. Logic (and the result toast) in ./index.tsx. */
export function ActionButtonView({
  variant,
  size,
  title,
  disabled,
  pending,
  onClick,
  className,
  children,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  title?: string;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  const button = (
    <Button
      variant={variant}
      size={size}
      loading={pending}
      disabled={disabled}
      onClick={onClick}
      className={className}
      aria-label={size.startsWith("icon") ? title : undefined}
    >
      {children}
    </Button>
  );
  // A disabled button gets no pointer events: wrap it so its reason still shows.
  if (!title) return button;
  return (
    <Tooltip content={title}>
      {disabled ? <span tabIndex={0} className="inline-flex">{button}</span> : button}
    </Tooltip>
  );
}
