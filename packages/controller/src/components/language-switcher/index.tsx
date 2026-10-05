"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/app/actions";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n-shared";
import { useLocale } from "@/components/i18n-provider";

/** Switch the UI language (EN/FR). Writes the locale cookie, then refreshes so
 * both server and client components re-render in the new language. */
export function LanguageSwitcher() {
  const router = useRouter();
  const current = useLocale();
  const [pending, start] = useTransition();

  const onChange = (locale: string) => {
    if (locale === current) return;
    start(async () => {
      await setLocale(locale);
      router.refresh();
    });
  };

  return (
    <label className="inline-flex items-center gap-1 text-muted-foreground" title="Language / Langue">
      <Languages className="h-4 w-4" />
      <select
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Language"
        className="cursor-pointer rounded-md bg-transparent py-1 pl-1 pr-5 text-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
