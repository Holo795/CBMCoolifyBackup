"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";

/** Action results appear as toasts at the top centre: clear of dialog footers, side panels and the activity bar. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      offset={16}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-border !bg-card !text-card-foreground !shadow-md !text-[13px]",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}
