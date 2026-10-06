"use client";

import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { Menu, Search, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui";
import { NavLinks } from "@/components/sidebar/nav-links";
import { useT } from "@/components/i18n-provider";

/** Presentation only: the mobile header + navigation drawer (below `md`). Logic in ./index.tsx. */
export function MobileNavView({
  open,
  onOpenChange,
  pathname,
  role,
  name,
  email,
  onSearch,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pathname: string;
  role: string;
  name: string;
  email?: string;
  onSearch: () => void;
}) {
  const t = useT();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-surface px-3 md:hidden">
      <D.Root open={open} onOpenChange={onOpenChange}>
        <D.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("components.openMenu")}>
            <Menu />
          </Button>
        </D.Trigger>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-[cbm-fade-in_150ms_ease-out]" />
          <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-surface shadow-lg focus:outline-none">
            <D.Title className="sr-only">{t("components.openMenu")}</D.Title>
            <D.Description className="sr-only">CBM</D.Description>
            <div className="flex h-14 items-center justify-between px-4">
              <Brand />
              <D.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("components.closeMenu")}>
                  <X />
                </Button>
              </D.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <NavLinks pathname={pathname} role={role} onNavigate={() => onOpenChange(false)} />
            </div>
            <div className="border-t p-2">
              <UserMenu name={name} email={email} role={role} />
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
      <Link href="/" aria-label="CBM">
        <Brand compact />
      </Link>
      <Button variant="ghost" size="icon" aria-label={t("common.search")} onClick={onSearch}>
        <Search />
      </Button>
    </header>
  );
}
