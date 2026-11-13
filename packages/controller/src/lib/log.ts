/**
 * For work done on a best-effort basis (an alert, a retention pass, a cache
 * write): its failure mustn't fail what called it, but must show in the logs.
 * `.catch(() => undefined)` hid an alert that couldn't be sent, or a
 * retention failing at every run while the destination filled up.
 */
export function logFailure(scope: string): (e: unknown) => void {
  return (e) => console.error(`[${scope}] ${e instanceof Error ? e.message : String(e)}`);
}
