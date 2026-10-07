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

/** What an exclusion names: a path on the host, a path where a container
 * mounts something, or (the original meaning) a path from the root of every
 * volume / host folder, or a bare name at any depth. */
export type ClassifiedExclude = { kind: "host" | "container" | "root"; path: string };

type Mount = { hostPath?: string; destinations: string[] };

const isUnder = (p: string, roots: string[]) => roots.some((r) => p === r || p.startsWith(`${r}/`));

/**
 * Sort out the resource's exclusions once, against all of its mounts: `host:` /
 * `container:` say it; otherwise a path that is (or is inside) one of its host
 * folders is a host path, else one that is (or is inside) a place a container
 * mounts something is a container path, else it keeps its original meaning. A
 * host path is never matched against container paths, nor the other way round
 * (a host folder under /data/... is not a path inside a container's /data).
 */
export function classifyExcludes(excludes: string[], mounts: Mount[]): ClassifiedExclude[] {
  const hostRoots = mounts.map((m) => m.hostPath).filter((r): r is string => !!r && r !== "/");
  const containerRoots = mounts.flatMap((m) => m.destinations).filter((d) => d && d !== "/");
  return excludes.map((raw) => {
    if (raw.startsWith("host:")) return { kind: "host", path: raw.slice("host:".length) };
    if (raw.startsWith("container:")) return { kind: "container", path: raw.slice("container:".length) };
    if (raw.startsWith("/") && isUnder(raw, hostRoots)) return { kind: "host", path: raw };
    if (raw.startsWith("/") && isUnder(raw, containerRoots)) return { kind: "container", path: raw };
    return { kind: "root", path: raw };
  });
}

/**
 * How the exclusions apply to one mount (a volume or a host folder): `skip` when
 * one names the mount itself, else the patterns from its root to leave out -
 * the root-relative ones, plus the host / container paths that fall inside
 * this mount (each only against its own kind of path).
 */
export function mountExcludes(mount: Mount, classified: ClassifiedExclude[]): { skip?: string; excludes: string[] } {
  const excludes: string[] = [];
  for (const c of classified) {
    if (c.kind === "root") {
      excludes.push(c.path);
      continue;
    }
    const roots = c.kind === "host" ? (mount.hostPath ? [mount.hostPath] : []) : mount.destinations.filter((d) => d && d !== "/");
    if (roots.includes(c.path)) return { skip: `${c.kind} path ${c.path}`, excludes: [] };
    const root = roots.find((r) => c.path.startsWith(`${r}/`));
    if (root) excludes.push(c.path.slice(root.length));
  }
  return { excludes: [...new Set(excludes)] };
}

/** Artifact meta key: every exclusion that applied to that mount, from its
 * root (JSON list) - what a restore in place leaves as it is. */
export const EXCLUDES_META = "excludes";
/** 2.4.6 snapshots: only the mount's own extras, on top of the manifest's list. */
const LEGACY_MOUNT_EXCLUDES_META = "mountExcludes";

export function excludesMeta(excludes: string[]): Record<string, string> {
  return excludes.length ? { [EXCLUDES_META]: JSON.stringify(excludes) } : {};
}

const parseList = (raw: string | undefined): string[] | null => {
  if (raw === undefined) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x && !/^(host|container):/.test(x)) : null;
  } catch {
    return null;
  }
};

/** Every exclusion a restore of this artifact must leave alone. */
export function artifactExcludes(manifestExcludes: string[] | undefined, meta: Record<string, string>): string[] {
  const own = parseList(meta[EXCLUDES_META]);
  if (own) return own;
  // Earlier snapshots: the resource's list (root-relative then) + the mount's extras.
  const legacy = parseList(meta[LEGACY_MOUNT_EXCLUDES_META]) ?? [];
  const base = (manifestExcludes ?? []).filter((x) => !/^(host|container):/.test(x));
  return [...new Set([...base, ...legacy])];
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
