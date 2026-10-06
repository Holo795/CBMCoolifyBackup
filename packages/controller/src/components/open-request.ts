"use client";

import { useEffect } from "react";

/**
 * Lets the command palette open a dialog on another page (or this one): it
 * navigates with `?open=<key>` and also fires a "cbm:open" event, for when the
 * page is already shown and won't remount.
 */
export const OPEN_EVENT = "cbm:open";

export function requestOpen(key: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: key }));
}

/** Drop `?open=` from the address so a reload doesn't reopen the dialog. */
function clearOpenParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("open")) return;
  url.searchParams.delete("open");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

/** Open (call `open`) when `key` is requested by URL or by event. */
export function useOpenRequest(key: string | undefined, open: () => void) {
  useEffect(() => {
    if (!key) return;
    if (new URL(window.location.href).searchParams.get("open") === key) {
      open();
      clearOpenParam();
    }
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== key) return;
      open();
      clearOpenParam();
    };
    window.addEventListener(OPEN_EVENT, onEvent);
    return () => window.removeEventListener(OPEN_EVENT, onEvent);
    // `open` is a state setter wrapper: stable enough, re-binding is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [key]);
}
