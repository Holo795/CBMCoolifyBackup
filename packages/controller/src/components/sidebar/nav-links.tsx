"use client";

import Link from "next/link";
import { navFor, NAV_GROUPS, isActive } from "@/components/nav";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/cn";

/** The grouped navigation links (sidebar and mobile drawer). */
export function NavLinks({ pathname, role, onNavigate }: { pathname: string; role: string; onNavigate?: () => void }) {
  const t = useT();
  const items = navFor(role);
  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((g) => {
        const group = items.filter((i) => i.group === g);
        if (group.length === 0) return null;
        return (
          <div key={g} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">
              {t(`nav.groups.${g}`)}
            </p>
            {group.map((item) => {
              const active = isActive(item.href, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", active ? "text-accent" : "text-subtle-foreground group-hover:text-muted-foreground")}
                  />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
