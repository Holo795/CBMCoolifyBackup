"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";

/** Presentation only: the top bar markup. Logic lives in ./index.tsx. */
export function TopbarView({
  name,
  role,
  onSearch,
  onSignOut,
}: {
  name: string;
  role: string;
  onSearch: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b px-4 sm:px-5">
      <div className="flex items-center gap-2">
        <MobileNav role={role} />
        <button
          className="flex w-36 sm:w-64 items-center justify-between rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/50"
          onClick={onSearch}
        >
          Search…
          <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/profile"
          className="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
          title="Profile"
        >
          {name}
          <Badge tone={role === "admin" ? "accent" : "neutral"}>{role}</Badge>
        </Link>
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Sign out" onClick={onSignOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
