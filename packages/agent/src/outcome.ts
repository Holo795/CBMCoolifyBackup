// What a backup run amounts to once capture is done. Kept free of Docker calls
// so the decision is unit-testable.

/** A container holding more than this outside any volume gets a warning. */
export const LAYER_WARN_BYTES = 50 * 1024 * 1024;

/**
 * - "data": something was captured (dump, volume, bind mount).
 * - "config": nothing to copy, but the resource runs here (e.g. a stateless app
 *   with no volume): keep its configuration (image/commit, environment) so it
 *   can be recreated with "→ new".
 * - "skip": no container on this host at all (never deployed, deleted, or on
 *   another server): nothing to keep.
 */
export function backupOutcome(artifactCount: number, hasContainer: boolean): "data" | "config" | "skip" {
  if (artifactCount > 0) return "data";
  return hasContainer ? "config" : "skip";
}

/** Log line for a container that wrote a lot outside any volume, else null. */
export function unbackedLayerWarning(container: string, writableBytes: number | null): string | null {
  if (writableBytes == null || writableBytes < LAYER_WARN_BYTES) return null;
  const mb = Math.round(writableBytes / (1024 * 1024));
  return (
    `${container} holds ${mb} MB written inside the container, outside any volume: ` +
    `it is not backed up and is lost when Coolify redeploys (add a volume if it is data)`
  );
}
