"use client";

import { type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui";

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
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      {children}
      {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      {warning && <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-warning">{warning}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
