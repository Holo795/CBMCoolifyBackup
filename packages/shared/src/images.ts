/** Docker image references: comparing them, and the version a container ran. */

/** Tags that move over time: a restore must pin the digest, not the tag. */
export const FLOATING_IMAGE_TAGS = ["latest", "main", "master", "stable", "edge", "nightly"];

/** Labels that carry an image's human-readable version, most specific first. */
const VERSION_LABELS = ["org.opencontainers.image.version", "org.label-schema.version", "version"];

/** The repository of an image reference, normalized for comparison: no tag or
 * digest, and Docker Hub's implicit prefixes dropped ("docker.io/library/
 * postgres:16" and "postgres" are the same repository). */
export function imageRepo(ref: string): string {
  const at = ref.indexOf("@");
  let core = (at >= 0 ? ref.slice(0, at) : ref).trim().toLowerCase();
  const slash = core.lastIndexOf("/");
  const colon = core.lastIndexOf(":");
  if (colon > slash) core = core.slice(0, colon);
  core = core.replace(/^(docker\.io|index\.docker\.io|registry-1\.docker\.io)\//, "");
  return core.replace(/^library\//, "");
}

/** The tag of an image reference ("latest" when none is written), or undefined
 * for a digest reference. */
export function imageTag(ref: string): string | undefined {
  if (ref.includes("@")) return undefined;
  const slash = ref.lastIndexOf("/");
  const colon = ref.lastIndexOf(":");
  return colon > slash ? ref.slice(colon + 1) : "latest";
}

/** True when the reference doesn't name one fixed image (latest, main...). */
export function isFloatingImage(ref: string): boolean {
  const tag = imageTag(ref);
  return tag !== undefined && FLOATING_IMAGE_TAGS.includes(tag.toLowerCase());
}

/** A pullable "repo@sha256:..." among an image's RepoDigests, preferring the
 * repository the container was started from. */
export function pickRepoDigest(repoDigests: string[] | undefined, ref?: string): string | undefined {
  const digests = (repoDigests ?? []).filter((d) => d.includes("@sha256:"));
  if (ref) {
    const repo = imageRepo(ref);
    const same = digests.find((d) => imageRepo(d) === repo);
    if (same) return same;
  }
  return digests[0];
}

/** The version an image declares (label), else a fixed tag it carries in the
 * same repository ("18.2.0-ce.0" next to "latest"), else the reference's own
 * tag when it isn't a floating one. */
export function imageVersion(
  labels: Record<string, string> | undefined,
  repoTags: string[] | undefined,
  ref?: string,
): string | undefined {
  for (const k of VERSION_LABELS) {
    const v = labels?.[k]?.trim();
    if (v) return v;
  }
  const repo = ref ? imageRepo(ref) : undefined;
  const fixed = (repoTags ?? []).find((t) => (!repo || imageRepo(t) === repo) && !isFloatingImage(t));
  if (fixed) return imageTag(fixed);
  if (ref && !isFloatingImage(ref)) return imageTag(ref);
  return undefined;
}
