"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";

/** Action results appear as toasts (bottom right), never inside the layout. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
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
