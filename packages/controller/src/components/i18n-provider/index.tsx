"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Locale, type T } from "@/lib/i18n-shared";

const I18nContext = createContext<{ locale: Locale; t: T }>({ locale: "en", t: (k) => k });

/** Makes the current locale's translator available to client components. The
 * locale comes from the server (cookie) via the root layout. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Translator hook for client components: `const t = useT()`. */
export function useT(): T {
  return useContext(I18nContext).t;
}

/** Current locale in client components. */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
