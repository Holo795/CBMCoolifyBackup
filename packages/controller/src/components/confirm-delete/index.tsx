"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDeleteView } from "./view";

/**
 * Destructive delete gated by a typed confirmation. The operator must type
 * `confirmWord` (e.g. the resource name, or "DELETE") before the action fires.
 */
export function ConfirmDeleteButton({
  action,
  confirmWord,
  title,
  body,
  label,
  variant = "danger",
  size = "sm",
  redirectTo,
}: {
  action: () => Promise<unknown>;
  confirmWord: string;
  title: string;
  body: ReactNode;
  label?: string;
  variant?: "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "icon";
  /** Navigate here after a successful delete (e.g. when the current page is the deleted item). */
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const ok = text.trim() === confirmWord;

  const onConfirm = () => {
    if (!ok) return;
    start(async () => {
      await action();
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  };

  return (
    <ConfirmDeleteView
      open={open}
      text={text}
      onTextChange={setText}
      pending={pending}
      ok={ok}
      confirmWord={confirmWord}
      title={title}
      body={body}
      label={label}
      variant={variant}
      size={size}
      onOpenClick={() => {
        setText("");
        setOpen(true);
      }}
      onClose={() => setOpen(false)}
      onConfirm={onConfirm}
    />
  );
}
