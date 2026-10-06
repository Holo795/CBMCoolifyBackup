"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
import { Kbd } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { NavLinks } from "./nav-links";

/** Presentation only: the desktop sidebar. Logic in ./index.tsx. */
export function SidebarView({
  pathname,
  role,
  name,
  email,
  onSearch,
}: {
  pathname: string;
  role: string;
  name: string;
  email?: string;
  onSearch: () => void;
}) {
  const t = useT();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-surface md:flex">
      <div className="flex h-16 items-center px-4">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Brand />
        </Link>
      </div>
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-8 w-full items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] text-muted-foreground shadow-sm transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">{t("common.search")}</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <NavLinks pathname={pathname} role={role} />
      </div>
      <div className="border-t p-2">
        <UserMenu name={name} email={email} role={role} />
      </div>
    </aside>
  );
}
