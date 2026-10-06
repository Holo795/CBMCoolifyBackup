"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun, Languages, User } from "lucide-react";
import { GithubIcon } from "@/components/icons/github";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  Badge,
} from "@/components/ui";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n-shared";
import { useT } from "@/components/i18n-provider";

function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Presentation only: the account button + its menu. Logic in ./index.tsx. */
export function UserMenuView({
  name,
  email,
  role,
  theme,
  onTheme,
  locale,
  onLocale,
  onSignOut,
}: {
  name: string;
  email?: string;
  role: string;
  theme: string;
  onTheme: (t: string) => void;
  locale: string;
  onLocale: (l: string) => void;
  onSignOut: () => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("nav.user.menu")}
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
          {initials(name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium">{name}</span>
          <span className="truncate text-xs capitalize text-muted-foreground">{role}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span className="truncate">{email ?? name}</span>
          <Badge tone={role === "admin" ? "accent" : "neutral"}>{role}</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <User /> {t("nav.user.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />} {t("nav.user.theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={onTheme}>
              <DropdownMenuRadioItem value="system">
                <Monitor /> {t("nav.user.themeSystem")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">
                <Sun /> {t("nav.user.themeLight")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> {t("nav.user.themeDark")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages /> {t("nav.user.language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={locale} onValueChange={onLocale}>
              {LOCALES.map((l) => (
                <DropdownMenuRadioItem key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <a href="https://github.com/Holo795/CBMCoolifyBackup" target="_blank" rel="noreferrer noopener">
            <GithubIcon /> {t("nav.user.source")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={onSignOut}>
          <LogOut /> {t("nav.user.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
