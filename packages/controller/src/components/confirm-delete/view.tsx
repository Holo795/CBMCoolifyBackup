"use client";

import { type ReactNode } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { Trash2, AlertTriangle } from "lucide-react";

/** Presentation only: the delete button + typed-confirmation modal. Logic in ./index.tsx. */
export function ConfirmDeleteView({
  open,
  text,
  onTextChange,
  pending,
  ok,
  confirmWord,
  title,
  body,
  label,
  variant,
  size,
  onOpenClick,
  onClose,
  onConfirm,
  error,
}: {
  open: boolean;
  text: string;
  onTextChange: (v: string) => void;
  pending: boolean;
  ok: boolean;
  confirmWord: string;
  title: string;
  body: ReactNode;
  label?: string;
  variant: "danger" | "ghost" | "outline";
  size: "sm" | "md" | "icon";
  onOpenClick: () => void;
  onClose: () => void;
  onConfirm: () => void;
  /** Why the action refused (shown in the dialog, which stays open). */
  error?: string | null;
}) {
  const t = useT();
  return (
    <>
      <Button size={size} variant={variant} aria-label={title} onClick={onOpenClick}>
        <Trash2 className="h-3.5 w-3.5" />
        {label ? <span className="ml-1">{label}</span> : null}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
          <div
            className="w-full max-w-md rounded-xl border border-[var(--color-danger)]/40 bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-[var(--color-danger)]">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="font-medium">{title}</h3>
            </div>
            <div className="mb-4 text-sm text-muted-foreground">{body}</div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t("components.typeBefore")} <span className="font-mono text-foreground">{confirmWord}</span> {t("components.typeAfter")}</label>
            <input
              autoFocus
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onConfirm()}
              placeholder={confirmWord}
              className="mb-4 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-danger)]"
            />
            {error && <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" variant="danger" disabled={!ok || pending} onClick={onConfirm}>
                {pending ? t("components.deleting") : t("common.delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
