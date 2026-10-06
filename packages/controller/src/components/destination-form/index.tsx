"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createDestination } from "@/app/actions";
import { Button, Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { useOpenRequest } from "@/components/open-request";
import { DestinationFormView, DESTINATION_FORM_ID } from "./view";

/** The new-destination form; `onDone` runs after a successful create. */
export function DestinationForm({ onDone, onPendingChange }: { onDone?: () => void; onPendingChange?: (v: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  const [type, setType] = useState("local");
  const [engine, setEngine] = useState("tar");
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    onPendingChange?.(true);
    start(async () => {
      const r = await createDestination(fd);
      onPendingChange?.(false);
      if (r?.error) setError(r.error);
      else {
        toast.success(t("destinations.added"));
        router.refresh();
        onDone?.();
      }
    });
  };

  return (
    <DestinationFormView type={type} onTypeChange={setType} engine={engine} onEngineChange={setEngine} error={error} onSubmit={onSubmit} />
  );
}

/** "Add destination" button + side panel holding the form. */
export function AddDestinationButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  useOpenRequest("add-destination", () => setOpen(true));
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus /> {t("destinations.add.title")}
        </Button>
      </DialogTrigger>
      <DialogContent
        side="right"
        title={t("destinations.add.title")}
        description={t("destinations.add.description")}
        footer={
          <>
            <DialogClose asChild>
              <Button>{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" form={DESTINATION_FORM_ID} variant="primary" loading={pending}>
              {t("destinations.form.submit")}
            </Button>
          </>
        }
      >
        <DestinationForm onDone={() => setOpen(false)} onPendingChange={setPending} />
      </DialogContent>
    </Dialog>
  );
}
