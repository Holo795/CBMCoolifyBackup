// Pure i18n helpers safe to import from client components (no next/headers).
import { dictionaries, type Dict } from "@/i18n/dictionaries";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "cbm_locale";
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", fr: "Français" };

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "en" || v === "fr";
}

/** Look up a dotted key in a dictionary, with `{var}` interpolation. Falls back
 * to English, then to the key itself, so a missing string is visible not blank. */
export function translate(dict: Dict, key: string, vars?: Record<string, string | number>): string {
  const walk = (d: Dict): unknown => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], d);
  let v = walk(dict);
  if (typeof v !== "string") v = walk(dictionaries.en);
  let s = typeof v === "string" ? v : key;
  if (vars) for (const [k, val] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(val));
  return s;
}

export type T = (key: string, vars?: Record<string, string | number>) => string;

/** A translator bound to a locale (used by the client provider and server getT). */
export function makeT(locale: Locale): T {
  const dict = dictionaries[locale];
  return (key, vars) => translate(dict, key, vars);
}
