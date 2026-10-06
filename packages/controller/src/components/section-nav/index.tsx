"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Sticky in-page table of contents; highlights the section in view. */
export function SectionNav({ items, label }: { items: { id: string; label: string }[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    // The last sections can't reach the top band: at the very bottom, pick the last one.
    const scroller = els[0]?.closest("main");
    const onScroll = () => {
      if (scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) setActive(items[items.length - 1]?.id);
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      scroller?.removeEventListener("scroll", onScroll);
    };
  }, [items]);

  return (
    <nav aria-label={label} className="sticky top-8 hidden flex-col gap-0.5 lg:flex">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          aria-current={active === i.id ? "location" : undefined}
          onClick={() => setActive(i.id)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
            active === i.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
