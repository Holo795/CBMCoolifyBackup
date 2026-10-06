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
