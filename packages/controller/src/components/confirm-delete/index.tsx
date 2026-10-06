"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button, Tooltip, type ButtonSize, type ButtonVariant } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { ConfirmDeleteDialogView } from "./view";

export type ConfirmDeleteProps = {
  action: () => Promise<unknown>;
  /** What the operator must type before the action fires (a name, or "DELETE"). */
  confirmWord: string;
  title: string;
  body: ReactNode;
  /** Navigate here after a successful delete (e.g. the page of the deleted item). */
  redirectTo?: string;
};

/** Controlled typed-confirmation dialog (open it from a menu, a button…). */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  action,
  confirmWord,
  title,
  body,
  redirectTo,
}: ConfirmDeleteProps & { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ok = text.trim() === confirmWord;

  const onOpen = (v: boolean) => {
    if (v) {
      setText("");
      setError(null);
    }
    onOpenChange(v);
  };

  const onConfirm = () => {
    if (!ok || pending) return;
    setError(null);
    start(async () => {
      const r = await action();
      // An action may refuse (e.g. a destination still used by schedules).
      if (r && typeof r === "object" && "error" in r && (r as { error?: string }).error) {
        setError(String((r as { error?: string }).error));
        return;
      }
      onOpenChange(false);
      toast.success(t("components.deleted"));
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  };

  return (
    <ConfirmDeleteDialogView
      open={open}
      onOpenChange={onOpen}
      text={text}
      onTextChange={setText}
      pending={pending}
      ok={ok}
      confirmWord={confirmWord}
      title={title}
      body={body}
      onConfirm={onConfirm}
      error={error}
    />
  );
}

/** A delete button that asks for a typed confirmation first. */
export function ConfirmDeleteButton({
  label,
  variant = "danger-ghost",
  size = "icon-sm",
  ...props
}: ConfirmDeleteProps & { label?: string; variant?: ButtonVariant | "danger" | "ghost" | "outline"; size?: ButtonSize | "sm" | "md" | "icon" }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const iconOnly = !label;
  const button = (
    <Button
      size={iconOnly ? (size === "sm" || size === "md" ? "icon-sm" : size) : size}
      variant={variant === "danger" && iconOnly ? "danger-ghost" : variant}
      aria-label={iconOnly ? t("common.delete") : undefined}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      <Trash2 aria-hidden />
      {label}
    </Button>
  );
  return (
    <>
      {iconOnly ? <Tooltip content={props.title}>{button}</Tooltip> : button}
      <ConfirmDeleteDialog open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
