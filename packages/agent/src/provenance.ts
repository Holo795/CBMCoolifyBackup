import { imageVersion, pickRepoDigest, type ImageProvenance, type Provenance } from "@cbm/shared";
import { inspectContainer, inspectImage, type DockerInspect } from "./docker.js";

/**
 * Capture git commit / image provenance for a resource by inspecting its
 * running container and image. The Coolify API stores git_commit_sha = "HEAD"
 * (not the resolved SHA), so the only reliable source is Docker itself.
 */
export async function captureProvenance(container: string): Promise<Provenance> {
  const prov: Provenance = {};
  const c = await inspectContainer(container);
  if (!c) return prov;

  const imageRef: string | undefined = c.Config?.Image;
  prov.imageRef = imageRef;

  const labels: Record<string, string> = c.Config?.Labels ?? {};
  prov.gitCommitSha = findCommit(labels);

  const img = await containerImage(c);
  if (img) {
    // Prefer a pullable repo digest (name@sha256:…) over the local image id,
    // so a "latest"/floating tag can be re-pinned to the exact deployed image.
    prov.imageDigest = pickRepoDigest(img.RepoDigests, imageRef) ?? img.Id;
    if (!prov.gitCommitSha) {
      prov.gitCommitSha = findCommit(img.Config?.Labels ?? {});
    }
  }

  // Coolify tags images it builds from git with the resolved commit SHA
  // (e.g. "<resource>_<name>:<40-hex>"). When no label carried the commit, use
  // that tag so a git app can be re-pinned to the code that matches the data.
  if (!prov.gitCommitSha && imageRef) {
    const tag = imageRef.includes("@") ? undefined : imageRef.split(":").pop();
    if (tag && /^[0-9a-f]{7,40}$/i.test(tag)) prov.gitCommitSha = tag;
  }
  return prov;
}

/**
 * The image each container runs: as written, its digest, its local id and its
 * version, so a restore can bring back exactly that version. Best effort: a
 * container that can't be inspected is left out.
 */
export async function captureImages(containers: string[]): Promise<ImageProvenance[]> {
  const out: ImageProvenance[] = [];
  for (const name of containers.slice(0, 50)) {
    const c = await inspectContainer(name).catch(() => null);
    const ref = c?.Config?.Image;
    if (!c || !ref) continue;
    const img = await containerImage(c);
    const service = c.Config?.Labels?.["com.docker.compose.service"];
    out.push({
      container: name,
      ...(service ? { service } : {}),
      ref,
      digest: pickRepoDigest(img?.RepoDigests, ref),
      id: img?.Id ?? c.Image,
      version: imageVersion(img?.Config?.Labels, img?.RepoTags, ref),
    });
  }
  return out;
}

/** The image the container actually runs: by id, since its tag ("latest") may
 * point to a newer image pulled since it started. */
async function containerImage(c: DockerInspect): Promise<DockerInspect | null> {
  const byId = c.Image ? await inspectImage(c.Image).catch(() => null) : null;
  return byId ?? (c.Config?.Image ? await inspectImage(c.Config.Image).catch(() => null) : null);
}

function findCommit(labels: Record<string, string>): string | undefined {
  for (const [k, v] of Object.entries(labels)) {
    const key = k.toLowerCase();
    if (
      (key.includes("commit") || key.includes("git.sha") || key.includes("revision")) &&
      /^[0-9a-f]{7,40}$/i.test(v)
    ) {
      return v;
    }
  }
  return undefined;
}
