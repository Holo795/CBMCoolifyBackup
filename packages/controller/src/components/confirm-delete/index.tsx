"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  /** Confirm button text (default "Delete") and success toast (default "Deleted"). */
  confirmLabel?: string;
  doneMsg?: string;
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
  confirmLabel,
  doneMsg,
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
      toast.success(doneMsg ?? t("components.deleted"));
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
      confirmLabel={confirmLabel ?? t("common.delete")}
    />
  );
}
