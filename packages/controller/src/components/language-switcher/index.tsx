"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/app/actions";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n-shared";
import { useLocale, useT } from "@/components/i18n-provider";

/** Switch the UI language (EN/FR). Writes the locale cookie, then refreshes so
 * both server and client components re-render in the new language. */
export function LanguageSwitcher() {
  const router = useRouter();
  const current = useLocale();
  const t = useT();
  const [pending, start] = useTransition();

  const onChange = (locale: string) => {
    if (locale === current) return;
    start(async () => {
      await setLocale(locale);
      router.refresh();
    });
  };

  return (
    <label
      className="relative inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
      title="Language / Langue"
    >
      <Languages className="size-4" />
      <select
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("components.language")}
        className="cursor-pointer appearance-none bg-transparent text-[13px] font-medium outline-none"
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
