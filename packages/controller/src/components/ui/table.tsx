import * as React from "react";
import { cn } from "@/lib/cn";

/** Data table in a card. Horizontal overflow scrolls inside the card, never the page. */
export function Table({ className, children, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className={cn("w-full border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("border-b bg-surface text-left", className)} {...props} />;
}

export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("h-9 whitespace-nowrap px-4 text-xs font-medium text-muted-foreground first:pl-5 last:pr-5", className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b last:border-0 transition-colors hover:bg-surface", className)} {...props} />;
}

export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("h-12 px-4 align-middle first:pl-5 last:pr-5", className)} {...props} />;
}

/** Stacked list of rows in a card (mobile-friendly alternative to a table). */
export function List({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("divide-y overflow-hidden rounded-xl border bg-card shadow-sm", className)} {...props} />;
}

export function ListItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", className)} {...props} />;
}
