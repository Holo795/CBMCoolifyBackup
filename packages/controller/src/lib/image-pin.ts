import { imageRepo, imageTag, type ImageProvenance, type Provenance } from "@cbm/shared";

/**
 * Which image version a restore runs. "snapshot" (default) pins every image to
 * the exact digest the containers ran when the snapshot was taken, so the data
 * and the code match; "current" keeps the references as written (a floating
 * "latest" then pulls whatever is newest, which may migrate the data).
 */
export type ImageChoice = "snapshot" | "current";

/** The images a snapshot recorded: every container (2.4.6+), else the primary one. */
export function snapshotImages(p: Provenance | null | undefined): ImageProvenance[] {
  if (p?.images?.length) return p.images;
  if (p?.imageRef) {
    return [{ ref: p.imageRef, digest: p.imageDigest?.includes("@sha256:") ? p.imageDigest : undefined }];
  }
  return [];
}

/** The recorded image for a compose service whose `image:` reads `ref`: by
 * service name first (the image may have been edited since it ran), else the
 * same reference. */
export function matchImage(images: ImageProvenance[], service: string | undefined, ref: string): ImageProvenance | undefined {
  if (service) {
    const byService = images.find((i) => i.service === service);
    if (byService) return byService;
  }
  if (ref.includes("${")) return undefined;
  return images.find((i) => imageRepo(i.ref) === imageRepo(ref) && imageTag(i.ref) === imageTag(ref));
}

export type ComposeChange = { service: string; from: string; to: string };

const SERVICE_KEY = /^(\s+)(["']?)([A-Za-z0-9._-]+)\2:\s*(#.*)?$/;
const IMAGE_LINE = /^(\s+)image:\s*(["']?)([^"'#\s]+)\2(\s+#.*)?\s*$/;

/**
 * Rewrite the `image:` of each service of a compose file to what `pick` returns
 * for it (undefined = leave it). Line by line, so comments, ordering and
 * quoting stay as the operator wrote them.
 */
export function pinCompose(
  compose: string,
  pick: (service: string, ref: string) => string | undefined,
): { compose: string; changes: ComposeChange[] } {
  const lines = compose.split("\n");
  const changes: ComposeChange[] = [];
  let inServices = false;
  let serviceIndent = -1;
  let service: string | undefined;
  let propIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inServices = /^services:\s*(#.*)?$/.test(line);
      serviceIndent = -1;
      service = undefined;
      continue;
    }
    if (!inServices) continue;
    if (serviceIndent < 0) serviceIndent = indent;
    if (indent === serviceIndent) {
      const m = SERVICE_KEY.exec(line);
      service = m?.[3];
      propIndent = -1;
      continue;
    }
    if (!service || indent < serviceIndent) continue;
    if (propIndent < 0) propIndent = indent;
    if (indent !== propIndent) continue;
    const img = IMAGE_LINE.exec(line);
    if (!img) continue;
    const [, pad, quote, ref, comment = ""] = img;
    const to = pick(service, ref);
    if (!to || to === ref) continue;
    lines[i] = `${pad}image: ${quote}${to}${quote}${comment}`;
    changes.push({ service, from: ref, to });
  }
  return { compose: lines.join("\n"), changes };
}

/** What a restore uses for one recorded image, and why when it isn't the digest. */
export type ResolvedImage = { image: ImageProvenance; use: string; note?: string };

/**
 * Turn each recorded image into the reference to run: its digest, or - when the
 * registry no longer has it - its version tag, else the reference as written,
 * with a note saying so. `exists` answers false only when the registry says
 * the image is gone; an unreachable or private registry keeps the digest (the
 * host may have the credentials or the image).
 */
export async function resolveImages(
  images: ImageProvenance[],
  exists: (ref: string) => Promise<boolean | undefined>,
): Promise<ResolvedImage[]> {
  const out: ResolvedImage[] = [];
  for (const image of images) {
    if (!image.digest) {
      out.push({ image, use: image.ref });
      continue;
    }
    if ((await exists(image.digest)) !== false) {
      out.push({ image, use: image.digest });
      continue;
    }
    const versioned = image.version ? `${imageRepoAsWritten(image.ref)}:${image.version}` : undefined;
    if (versioned && (await exists(versioned)) !== false) {
      out.push({
        image,
        use: versioned,
        note: `${image.digest} is no longer in its registry: using ${versioned} (same version, possibly a rebuilt image)`,
      });
      continue;
    }
    out.push({
      image,
      use: image.ref,
      note: `${image.digest} is no longer in its registry and no version tag was found: keeping ${image.ref}, which may run a different version than the data`,
    });
  }
  return out;
}

/** The reference without its tag or digest, as written ("reg:5000/a/b:1" -> "reg:5000/a/b"). */
function imageRepoAsWritten(ref: string): string {
  const at = ref.indexOf("@");
  const core = at >= 0 ? ref.slice(0, at) : ref;
  const slash = core.lastIndexOf("/");
  const colon = core.lastIndexOf(":");
  return colon > slash ? core.slice(0, colon) : core;
}

/** Pin a compose file to a snapshot's images (resolved): the `pick` for pinCompose. */
export function composePicker(resolved: ResolvedImage[]): (service: string, ref: string) => string | undefined {
  const images = resolved.map((r) => r.image);
  return (service, ref) => {
    const match = matchImage(images, service, ref);
    return match ? resolved[images.indexOf(match)].use : undefined;
  };
}

/* ------------------------------ registry check ------------------------------ */

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

/** Registry host, repository path and reference (tag or digest) of an image. */
export function registryParts(ref: string): { host: string; repo: string; reference: string } {
  const at = ref.indexOf("@");
  let core = at >= 0 ? ref.slice(0, at) : ref;
  let reference = at >= 0 ? ref.slice(at + 1) : "latest";
  if (at < 0) {
    const slash = core.lastIndexOf("/");
    const colon = core.lastIndexOf(":");
    if (colon > slash) {
      reference = core.slice(colon + 1);
      core = core.slice(0, colon);
    }
  }
  const first = core.split("/")[0];
  const hasHost = core.includes("/") && (first.includes(".") || first.includes(":") || first === "localhost");
  let host = hasHost ? first : "registry-1.docker.io";
  let repo = hasHost ? core.slice(first.length + 1) : core;
  if (host === "docker.io" || host === "index.docker.io") host = "registry-1.docker.io";
  if (host === "registry-1.docker.io" && !repo.includes("/")) repo = `library/${repo}`;
  return { host, repo, reference };
}

/**
 * Whether a registry still serves an image: true / false (it answered "not
 * found"), or undefined when it can't tell (unreachable, private, rate-limited).
 * Anonymous pull tokens are fetched the way `docker pull` does.
 */
export async function imageExists(ref: string, fetchImpl: typeof fetch = fetch): Promise<boolean | undefined> {
  const { host, repo, reference } = registryParts(ref);
  const url = `https://${host}/v2/${repo}/manifests/${reference}`;
  const head = (auth?: string) =>
    fetchImpl(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: MANIFEST_ACCEPT, ...(auth ? { authorization: auth } : {}) },
    });
  try {
    let res = await head();
    if (res.status === 401) {
      const challenge = res.headers.get("www-authenticate") ?? "";
      const realm = /realm="([^"]+)"/.exec(challenge)?.[1];
      if (!/^bearer/i.test(challenge) || !realm) return undefined;
      const service = /service="([^"]+)"/.exec(challenge)?.[1];
      const tokenUrl = new URL(realm);
      if (service) tokenUrl.searchParams.set("service", service);
      tokenUrl.searchParams.set("scope", `repository:${repo}:pull`);
      const tok = await fetchImpl(tokenUrl, { signal: AbortSignal.timeout(10_000) });
      if (!tok.ok) return undefined;
      const body = (await tok.json()) as { token?: string; access_token?: string };
      const token = body.token ?? body.access_token;
      if (!token) return undefined;
      res = await head(`Bearer ${token}`);
    }
    if (res.ok) return true;
    if (res.status === 404) return false;
    return undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------ restore dialog ------------------------------ */

/** One image as the restore dialog shows it: the snapshot's version next to
 * the reference as written, and whether the container still runs it. */
export type VersionRow = {
  name: string;
  written: string;
  version?: string;
  digest?: string;
  /** In place: does the container run the snapshot's image? undefined = unknown. */
  running?: "same" | "different";
};

export function versionRows(
  images: ImageProvenance[],
  running: Array<{ name: string; service?: string; imageId?: string }> | null | undefined,
): VersionRow[] {
  const rows = images.map((i, idx): VersionRow => {
    const live =
      (i.service ? running?.find((c) => c.service === i.service) : undefined) ??
      (images.length === 1 && running?.length === 1 ? running[0] : undefined);
    return {
      name: i.service ?? (images.length > 1 ? (i.container ?? `#${idx + 1}`) : ""),
      written: i.ref,
      version: i.version,
      digest: i.digest,
      running: i.id && live?.imageId ? (live.imageId === i.id ? "same" : "different") : undefined,
    };
  });
  // Replicas of one service show once.
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = rowKey(r);
    return !seen.has(key) && !!seen.add(key);
  });
}

/** Identifies a row of the dialog (also its React key). */
export const rowKey = (r: VersionRow) => `${r.name}|${r.written}|${r.digest ?? ""}|${r.running ?? ""}`;
