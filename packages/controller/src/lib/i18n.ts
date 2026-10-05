import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, makeT, type Locale, type T } from "./i18n-shared";

export * from "./i18n-shared";

/** The active locale for this request (cookie), English by default. */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
}

/** Server-side translator for the current request's locale. */
export async function getT(): Promise<T> {
  return makeT(await getLocale());
}
