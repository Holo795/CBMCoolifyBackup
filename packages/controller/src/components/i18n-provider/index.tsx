"use client";

import { createContext, use, useMemo } from "react";
import { makeT, type Locale, type T } from "@/lib/i18n-shared";

const I18nContext = createContext<{ locale: Locale; t: T }>({ locale: "en", t: (k) => k });

/** Makes the current locale's translator available to client components. The
 * locale comes from the server (cookie) via the root layout. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

/** Translator hook for client components: `const t = useT()`. */
export function useT(): T {
  return use(I18nContext).t;
}

/** Current locale in client components. */
export function useLocale(): Locale {
  return use(I18nContext).locale;
}
