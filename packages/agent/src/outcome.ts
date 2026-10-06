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

/** Log line when the controller couldn't read the resource's config from Coolify. */
export function captureErrorWarning(configCaptureError: string | undefined): string | null {
  if (!configCaptureError) return null;
  return `Could not read this resource's configuration from Coolify (${configCaptureError}): this snapshot can't recreate its environment or settings`;
}

/**
 * A configuration-only snapshot keeps nothing but that configuration: when its
 * capture failed, the run must fail (and alert) rather than store an empty one.
 */
export function configOnlyFailure(outcome: "data" | "config" | "skip", configCaptureError: string | undefined): string | null {
  if (outcome !== "config" || !configCaptureError) return null;
  return `Configuration-only backup failed: ${configCaptureError}`;
}
