"use client";

import { type RefObject } from "react";
import { Search, CornerDownLeft, type LucideIcon } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { Kbd } from "@/components/ui";
import { cn } from "@/lib/cn";

export type Entry = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  group: string;
  keywords?: string[];
  icon?: LucideIcon;
};

/** Presentation only: the command-palette overlay + result list. Logic in ./index.tsx. */
export function CommandPaletteView({
  query,
  onQueryChange,
  filtered,
  active,
  onActiveChange,
  onSelect,
  onClose,
  onKeyNav,
  listRef,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  filtered: Entry[];
  active: number;
  onActiveChange: (i: number) => void;
  onSelect: (e: Entry) => void;
  onClose: () => void;
  onKeyNav: (e: React.KeyboardEvent) => void;
  listRef: RefObject<HTMLUListElement | null>;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay p-4 pt-[12vh] backdrop-blur-[2px] animate-[cbm-fade-in_120ms_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("components.palette.placeholder")}
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-card shadow-lg animate-[cbm-pop-in_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyNav}
      >
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("components.palette.placeholder")}
            aria-label={t("components.palette.placeholder")}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul ref={listRef} className="max-h-[min(24rem,60dvh)] overflow-auto p-2">
          {filtered.map((e, i) => {
            const prev = filtered[i - 1];
            const showGroup = !prev || prev.group !== e.group;
            const Icon = e.icon;
            return (
              <li key={e.id}>
                {showGroup && (
                  <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">
                    {t(`components.palette.groups.${e.group}`)}
                  </div>
                )}
                <button
                  data-i={i}
                  onMouseMove={() => onActiveChange(i)}
                  onClick={() => onSelect(e)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                    i === active ? "bg-accent-soft text-foreground" : "text-foreground/90",
                  )}
                >
                  {Icon ? (
                    <Icon className={cn("size-4 shrink-0", i === active ? "text-accent" : "text-muted-foreground")} />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-left">{e.label}</span>
                  {e.sub && <span className="shrink-0 text-xs text-muted-foreground">{e.sub}</span>}
                  {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-accent" />}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-muted-foreground">{t("components.palette.noResults")}</li>}
        </ul>
      </div>
    </div>
  );
}
