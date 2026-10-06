import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";

/** Centered layout for the signed-out pages (sign-in, reset, invite). */
export function AuthShell({
  title,
  description,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Room for wider content (e.g. a QR code next to its key). */
  wide?: boolean;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className={`flex w-full flex-col gap-6 ${wide ? "max-w-lg" : "max-w-[22rem]"}`}>
        <Brand className="justify-center" />
        <div className="rounded-xl border bg-card p-6 shadow-md sm:p-7">
          <div className="mb-5 flex flex-col gap-1 text-center">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="text-center text-[13px] text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

/** Inline form error / notice used on the signed-out pages. */
export function AuthMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
          : "rounded-lg border bg-surface px-3 py-2 text-[13px] text-muted-foreground"
      }
    >
      {children}
    </p>
  );
}
