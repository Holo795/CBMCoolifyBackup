/** Helpers for deterministic snapshot directory / file naming. */

/**
 * Build the relative directory for a snapshot, namespaced by instance so a
 * destination shared by several Coolify instances (or two agents on one host)
 * keeps each instance's backups cleanly separated:
 *   <instanceKey>/<resourceUuid>/backups/<timestamp>
 * `instanceKey` is the controller's instance id (stable, path-safe).
 */
export function snapshotDir(
  instanceKey: string,
  resourceUuid: string,
  mode: "backup" | "sync",
  isoTimestamp: string,
): string {
  const safe = isoTimestamp.replace(/[:.]/g, "-");
  if (mode === "sync") {
    // Sync keeps ONE copy, but each run writes a folder of its own and the
    // previous copy is deleted only once the new one is stored and verified
    // (overwriting in place left nothing when an upload failed). Deliberately
    // NOT under the pre-2.1 "<uuid>/sync" folder, so deleting a legacy copy can
    // never touch a new one.
    return `${instanceKey}/${resourceUuid}/sync-copies/${safe}`;
  }
  return `${instanceKey}/${resourceUuid}/backups/${safe}`;
}

/** Stable artifact file name for a database dump. */
export function dumpFileName(engine: string, database: string | undefined): string {
  const db = database && database.length > 0 ? database : "all";
  return `dump-${engine}-${db}.sql`;
}

/** Stable artifact file name for a docker volume tarball. */
export function volumeFileName(volume: string): string {
  return `volume-${volume}.tar`;
}

export const CONFIG_FILE = "config.json";
export const ENV_FILE = "env.json";
export const MANIFEST_FILE = "manifest.json";
export const ENCRYPTED_SUFFIX = ".age";
