"use client";

import Link from "next/link";
import { Menu, X, Github } from "lucide-react";
import { navFor } from "@/components/nav";
import { cn } from "@/lib/cn";

/** Presentation only: hamburger button + slide-out drawer. Logic in ./index.tsx. */
export function MobileNavView({
  open,
  onOpen,
  onClose,
  pathname,
  role,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  pathname: string;
  role: string;
}) {
  return (
    <div className="md:hidden">
      <button
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
        onClick={onOpen}
      >
        <Menu className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
          <aside className="absolute left-0 top-0 flex h-full w-64 max-w-[80%] flex-col border-r bg-card">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="text-base font-semibold tracking-wide">CBM</span>
              <button
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
              {navFor(role).map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t p-3 text-xs text-muted-foreground">
              <a
                href="https://github.com/Holo795/CBMCoolifyBackup"
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Github className="h-3.5 w-3.5" />
                <span>
                  Built by <span className="font-medium text-foreground">Holo795</span>
                </span>
              </a>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
