"use client";

import { type RefObject } from "react";
import { Search, CornerDownLeft, type LucideIcon } from "lucide-react";

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
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyNav}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Jump to a page, resource, destination… (try “timezone”)"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <ul ref={listRef} className="max-h-80 overflow-auto p-1.5">
          {filtered.map((e, i) => {
            const prev = filtered[i - 1];
            const showGroup = !prev || prev.group !== e.group;
            const Icon = e.icon;
            return (
              <li key={e.id}>
                {showGroup && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {e.group}
                  </div>
                )}
                <button
                  data-i={i}
                  onMouseMove={() => onActiveChange(i)}
                  onClick={() => onSelect(e)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                    i === active ? "bg-muted" : "hover:bg-muted/60"
                  }`}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : <span className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-left">{e.label}</span>
                  {e.sub && <span className="shrink-0 text-xs text-muted-foreground">{e.sub}</span>}
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No results</li>}
        </ul>
      </div>
    </div>
  );
}
