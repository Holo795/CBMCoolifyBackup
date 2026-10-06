"use client";

import { useId, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, slottable } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { useOpenRequest } from "@/components/open-request";

type Result = { ok?: boolean; error?: string; warning?: string; detail?: string } | void;

/**
 * A button that opens a form in a dialog (or a side panel). The form posts to a
 * server action; on success the dialog closes and a toast confirms, on error
 * the message shows in the dialog.
 */
export function FormDialog({
  trigger,
  title,
  description,
  side,
  action,
  submitLabel,
  successMsg,
  openKey,
  children,
}: {
  /** A single button element (opens the dialog). */
  trigger: ReactElement;
  title: string;
  description?: string;
  side?: "right";
  action: (fd: FormData) => Promise<Result>;
  submitLabel: string;
  successMsg?: string;
  /** Lets the command palette open this dialog (see useOpenRequest). */
  openKey?: string;
  children: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useOpenRequest(openKey, () => {
    setError(null);
    setOpen(true);
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await action(fd);
      if (r && r.error) {
        setError(r.error);
        return;
      }
      setOpen(false);
      if (r && r.warning) toast.warning(r.warning);
      else toast.success((r && r.detail) || successMsg || t("common.done"));
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setError(null);
      }}
    >
      <DialogTrigger asChild>{slottable(trigger)}</DialogTrigger>
      <DialogContent
        side={side}
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button>{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" form={formId} variant="primary" loading={pending}>
              {submitLabel}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
          {children}
          {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
