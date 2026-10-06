import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { T } from "@/lib/i18n-shared";

/** Page numbers to show: the first, the last, and two around the current one. */
export function pageWindow(page: number, total: number): Array<number | "gap"> {
  const keep = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total));
  const out: Array<number | "gap"> = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 2) out.push("gap");
    else if (p - prev === 2) out.push(p - 1);
    out.push(p);
    prev = p;
  }
  return out;
}

/** Previous / numbered pages / next, as links (lists stay server-rendered). */
export function Pager({ t, page, totalPages, href }: { t: T; page: number; totalPages: number; href: (p: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label={t("resources.pagination")} className="flex flex-wrap items-center gap-1">
      {page > 1 && (
        <Link href={href(page - 1)} className={buttonClass("ghost", "sm")} aria-label={t("resources.prev")}>
          <ChevronLeft /> <span className="hidden sm:inline">{t("resources.prev")}</span>
        </Link>
      )}
      {pageWindow(page, totalPages).map((p, i, all) =>
        p === "gap" ? (
          // A gap sits right after a distinct page number: key it by that page.
          <span key={`gap-after-${all[i - 1]}`} className="px-1 text-subtle-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(buttonClass(p === page ? "secondary" : "ghost", "sm"), "tabular min-w-8 justify-center")}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link href={href(page + 1)} className={buttonClass("ghost", "sm")} aria-label={t("resources.next")}>
          <span className="hidden sm:inline">{t("resources.next")}</span> <ChevronRight />
        </Link>
      )}
    </nav>
  );
}
