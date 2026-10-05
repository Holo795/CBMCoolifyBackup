"use client";

import { type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the form shell + status messages. Logic in ./index.tsx. */
export function ActionFormView({
  formRef,
  onSubmit,
  children,
  submitLabel,
  pending,
  error,
  warning,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  warning: string | null;
}) {
  const t = useT();
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      {children}
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {warning && <p className="text-sm text-[var(--color-warning)]">{warning}</p>}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {pending ? t("components.working") : submitLabel}
      </Button>
    </form>
  );
}
