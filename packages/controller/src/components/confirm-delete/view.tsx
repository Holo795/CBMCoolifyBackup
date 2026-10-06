"use client";

import { useId, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { AlertTriangle } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the typed-confirmation delete dialog. Logic in ./index.tsx. */
export function ConfirmDeleteDialogView({
  open,
  onOpenChange,
  text,
  onTextChange,
  pending,
  ok,
  confirmWord,
  title,
  body,
  onConfirm,
  error,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  text: string;
  onTextChange: (v: string) => void;
  pending: boolean;
  ok: boolean;
  confirmWord: string;
  title: string;
  confirmLabel: string;
  body: ReactNode;
  onConfirm: () => void;
  /** Why the action refused (shown in the dialog, which stays open). */
  error?: string | null;
}) {
  const t = useT();
  const inputId = useId();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-[cbm-fade-in_150ms_ease-out]" />
        <D.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card shadow-lg focus:outline-none data-[state=open]:animate-[cbm-pop-in_160ms_ease-out]">
          <div className="flex gap-3.5 p-5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="size-4.5" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <D.Title className="text-[15px] font-semibold tracking-tight">{title}</D.Title>
              <D.Description asChild>
                <div className="text-[13px] leading-5 text-muted-foreground">{body}</div>
              </D.Description>
              <label htmlFor={inputId} className="mt-3 text-xs text-muted-foreground">
                {t("components.typeBefore")} <span className="font-mono font-medium text-foreground">{confirmWord}</span>{" "}
                {t("components.typeAfter")}
              </label>
              <Input
                id={inputId}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onConfirm()}
                placeholder={confirmWord}
                className="font-mono"
              />
              {error && <p className="text-[13px] text-danger">{error}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-surface px-5 py-3">
            <D.Close asChild>
              <Button size="sm">{t("common.cancel")}</Button>
            </D.Close>
            <Button size="sm" variant="danger" disabled={!ok} loading={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
