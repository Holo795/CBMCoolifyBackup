"use client";

import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { ActionButtonView } from "./view";
import { useT } from "@/components/i18n-provider";
import type { ButtonSize, ButtonVariant } from "@/components/ui";

type Result = { ok?: boolean; error?: string; detail?: string } | void;

/** Runs a server action; its outcome is shown as a toast. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "sm",
  confirm,
  successMsg,
  disabled = false,
  title,
  className,
}: {
  action: () => Promise<Result>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirm?: string;
  successMsg?: string;
  /** Disable the button (e.g. nothing to act on); `title` explains why on hover. */
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const t = useT();
  const [pending, start] = useTransition();

  const onClick = () => {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => {
      try {
        const r = await action();
        if (r && "error" in r && r.error) toast.error(r.error);
        else toast.success((r && "detail" in r && r.detail) || successMsg || t("common.done"));
      } catch (e) {
        toast.error((e as Error).message || t("common.error"));
      }
    });
  };

  return (
    <ActionButtonView
      variant={variant}
      size={size}
      title={title}
      disabled={disabled}
      pending={pending}
      onClick={onClick}
      className={className}
    >
      {children}
    </ActionButtonView>
  );
}
