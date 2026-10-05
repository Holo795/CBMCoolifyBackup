/**
 * Rewiring of cross-resource references for "restore → new".
 *
 * Coolify containers reach each other by a hostname derived from the resource
 * uuid (e.g. `postgres://app:pw@<db-uuid>:5432/app`). A cloned app keeps the
 * env values of its source, so it would still talk to the ORIGINAL database —
 * for a restored copy that's the dangerous outcome (a test clone writing to
 * production). Given the original → clone uuid pairs of resources already
 * restored onto the same instance, this rewrites those references to the clones.
 */
export type RemapChange = { key: string; from: string; to: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Return `envs` with every whole-token occurrence of an original uuid replaced
 * by its clone's uuid, plus the list of changes. A token only matches when it
 * isn't part of a longer alphanumeric run, so unrelated values are untouched.
 * Inputs are never mutated.
 */
export function remapEnv(
  envs: Array<Record<string, unknown>>,
  mapping: Record<string, string>,
): { envs: Array<Record<string, unknown>>; changes: RemapChange[] } {
  const pairs: Array<[string, string]> = [];
  for (const [from, to] of Object.entries(mapping)) {
    if (!from || !to || from === to) continue;
    pairs.push([from, to]);
    // Coolify derives some names from the dash-stripped uuid (see the volume map).
    const fromBare = from.replace(/-/g, "");
    if (fromBare !== from) pairs.push([fromBare, to.replace(/-/g, "")]);
  }
  if (pairs.length === 0) return { envs, changes: [] };

  const changes: RemapChange[] = [];
  const out = envs.map((e) => {
    if (typeof e.value !== "string" || e.value === "") return e;
    let value = e.value;
    for (const [from, to] of pairs) {
      const next = value.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(from)}(?![A-Za-z0-9])`, "g"), to);
      if (next !== value) {
        changes.push({ key: String(e.key ?? ""), from, to });
        value = next;
      }
    }
    return value === e.value ? e : { ...e, value };
  });
  return { envs: out, changes };
}
