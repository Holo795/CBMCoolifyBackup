import { posix } from "node:path";

/**
 * An in-place restore of a host folder (a bind mount) wipes that folder and
 * extracts the backup into it. The folder comes from the snapshot's manifest, so
 * it is checked at restore time too: system locations, top-level directories
 * and anything that could alter the docker `-v` spec are refused.
 */

// Wiping these themselves would be catastrophic (subfolders are fine:
// e.g. /data/coolify/applications/<uuid>/storage).
const EXACT = new Set([
  "/",
  "/home",
  "/root",
  "/var",
  "/var/lib",
  "/var/log",
  "/opt",
  "/srv",
  "/mnt",
  "/media",
  "/tmp",
  "/data",
  "/data/coolify",
]);
// Never anything at or below these.
const SUBTREES = [
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib32",
  "/lib64",
  "/libx32",
  "/boot",
  "/proc",
  "/sys",
  "/dev",
  "/run",
  "/var/run",
  "/var/lib/docker",
  "/var/lib/containerd",
];

/** Why `path` must not be restored into, or null when it's safe. */
export function unsafeRestorePath(path: string): string | null {
  if (!path || !path.startsWith("/")) return "not an absolute path";
  if (/[:\n\r\0]/.test(path)) return "contains a character that would change the mount";
  if (path.split("/").includes("..")) return 'contains ".."';
  const p = posix.normalize(path).replace(/\/+$/, "") || "/";
  if (EXACT.has(p)) return "is a top-level or system directory";
  if (SUBTREES.some((root) => p === root || p.startsWith(`${root}/`))) return "is inside a system directory";
  return null;
}
