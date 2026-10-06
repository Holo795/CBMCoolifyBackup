"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input, Select } from "@/components/ui";

/**
 * Search box + optional select filter that update the URL as you type
 * (debounced), so lists stay server-rendered and shareable.
 */
export function FilterBar({
  placeholder,
  select,
}: {
  placeholder: string;
  /** e.g. a "type" filter: param name, the "all" label and the options. */
  select?: { param: string; allLabel: string; label: string; options: { value: string; label: string }[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const firstRef = useRef(true);

  const push = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete("page");
    start(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`));
  };

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const h = setTimeout(() => push({ q: q.trim() }), 250);
    return () => clearTimeout(h);
    // Only the typed text drives this; `push` reads the current URL when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9"
        />
        {pending && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-subtle-foreground" />}
      </div>
      {select && (
        <Select
          aria-label={select.label}
          value={params.get(select.param) ?? ""}
          onChange={(e) => push({ [select.param]: e.target.value })}
          className="sm:w-52"
        >
          <option value="">{select.allLabel}</option>
          {select.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
