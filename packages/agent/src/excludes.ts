/*
 * A resource's exclusions (see normalizeExcludes in @cbm/shared) as each tool
 * wants them. `/path` is anchored at the root of every volume or host folder;
 * a bare name matches at any depth.
 */

/** Single-quote a token for POSIX sh. */
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** `restic backup <root>`: anchored patterns need the snapshot path in front. */
export function resticBackupExcludes(root: string, excludes: string[]): string[] {
  return excludes.flatMap((p) => ["--exclude", p.startsWith("/") ? `${root}${p}` : p]);
}

/** `restic restore <id>:<root>`: paths are relative to the restored folder. */
export function resticRestoreExcludes(excludes: string[]): string[] {
  return excludes.flatMap((p) => ["--exclude", p]);
}

/** `tar -cf - -C <root> .`: entries read `./path`. */
export function tarExcludes(excludes: string[]): string[] {
  return excludes.flatMap((p) => ["--exclude", p.startsWith("/") ? `.${p}` : p]);
}

/**
 * Shell that empties `dir` before a tar is extracted into it, keeping what the
 * exclusions name (and anything inside it). Without exclusions, the previous
 * wipe. A folder that still holds a kept path stays.
 */
export function wipeScript(dir: string, excludes: string[]): string {
  if (excludes.length === 0) return `rm -rf ${dir}/* ${dir}/..?* ${dir}/.[!.]* 2>/dev/null`;
  const keep = excludes.map((p) =>
    p.startsWith("/")
      ? `-path ${shq(`${dir}${p}`)} -o -path ${shq(`${dir}${p}/*`)}`
      : `-name ${shq(p)} -o -path ${shq(`*/${p}/*`)}`,
  );
  // Kept paths are matched and skipped; the rest is deleted children first.
  return `find ${dir} -mindepth 1 -depth \\( ${keep.join(" -o ")} \\) -o -delete 2>/dev/null; true`;
}

/**
 * How the exclusions apply to one mount (a volume or a host folder), given its
 * host path and where containers mount it. An exclusion naming the mount
 * itself - its host path or its path in a container - leaves it out entirely
 * (`skip`); one naming a path inside it, the same two ways, becomes a `/path`
 * from its root for this mount only (`extra`). Other exclusions keep their
 * usual meaning for every mount.
 */
export function mountExcludes(
  mount: { hostPath?: string; destinations: string[] },
  excludes: string[],
): { skip?: string; extra: string[] } {
  const roots = [mount.hostPath, ...mount.destinations].filter((r): r is string => !!r && r !== "/");
  const extra: string[] = [];
  for (const p of excludes) {
    if (!p.startsWith("/")) continue;
    if (roots.includes(p)) return { skip: p, extra: [] };
    const root = roots.find((r) => p.startsWith(`${r}/`));
    if (root) extra.push(p.slice(root.length));
  }
  return { extra: [...new Set(extra)] };
}

/** Artifact meta key: exclusions that applied to that mount only (JSON list),
 * which a restore in place leaves as they are, like the resource's own. */
export const MOUNT_EXCLUDES_META = "mountExcludes";

export function mountExcludeMeta(extra: string[]): Record<string, string> {
  return extra.length ? { [MOUNT_EXCLUDES_META]: JSON.stringify(extra) } : {};
}

/** Every exclusion a restore of this artifact must leave alone. */
export function artifactExcludes(manifestExcludes: string[] | undefined, meta: Record<string, string>): string[] {
  let own: string[] = [];
  try {
    const v = JSON.parse(meta[MOUNT_EXCLUDES_META] ?? "[]");
    if (Array.isArray(v)) own = v.filter((x): x is string => typeof x === "string" && x.startsWith("/"));
  } catch {
    /* ignore a malformed list */
  }
  return [...new Set([...(manifestExcludes ?? []), ...own])];
}

/** Host folders that sit inside another one of the list: copying the outer one
 * already reads them, so they aren't read a second time. */
export function nestedFolders(folders: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of folders) {
    const outer = folders.find((o) => o !== f && f.startsWith(`${o.replace(/\/+$/, "")}/`));
    if (outer) out.set(f, outer);
  }
  return out;
}
