import type { DiscoveredContainer } from "@cbm/shared";
import { detectEngine } from "./engines.js";

/**
 * Per-container hooks: which containers a resource has, and which of them a
 * hook targets. Kept pure so the matching rules are unit-tested.
 *
 * Coolify app containers are renamed on every deploy (`<uuid>-<timestamp>`), so
 * a hook should target the docker compose SERVICE name (stable) rather than the
 * container name. Targets are only matched among the resource's own containers.
 */

const UUID_RE = /^[a-z0-9]{20,32}$/;
const COOLIFY_LABEL_RE = /(?:^|,)coolify\.(?:resourceUuid|serviceId|applicationId|name)=([a-z0-9]{20,32})(?=,|$)/g;
/** Format string for `docker ps` matching groupContainersByResource. */
export const PS_FORMAT = '{{.Names}}\t{{.Label "com.docker.compose.service"}}\t{{.Labels}}\t{{.Mounts}}\t{{.ID}}\t{{.Image}}';

const uuidTokens = (s: string) => s.split(/[-_.,/\s]+/).filter((t) => UUID_RE.test(t));

/**
 * Group `docker ps -a --format PS_FORMAT` output by Coolify resource uuid. A
 * container belongs to a uuid that appears in its name, in a coolify.* label,
 * or in one of its mounted volume names (the same rules resolveResource uses).
 */
export function groupContainersByResource(
  psOutput: string,
  maxResources = 300,
): Record<string, DiscoveredContainer[]> {
  const out = new Map<string, Map<string, DiscoveredContainer>>();
  for (const line of psOutput.split("\n")) {
    if (!line.trim()) continue;
    const [name = "", service = "", labels = "", mounts = "", , image = ""] = line.split("\t");
    if (!name) continue;
    const uuids = new Set<string>(uuidTokens(name));
    for (const m of labels.matchAll(COOLIFY_LABEL_RE)) uuids.add(m[1]);
    for (const vol of mounts.split(",")) for (const t of uuidTokens(vol)) uuids.add(t);
    for (const u of uuids) {
      if (!out.has(u)) {
        if (out.size >= maxResources) continue;
        out.set(u, new Map());
      }
      // The database engine its image runs, if any (CBM shows a resource's
      // dump login only when it has a database).
      const engine = detectEngine(image.trim());
      out.get(u)!.set(name, { name, ...(service ? { service } : {}), ...(engine ? { engine } : {}) });
    }
  }
  const result: Record<string, DiscoveredContainer[]> = {};
  for (const [u, byName] of out) {
    result[u] = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
  }
  return result;
}

/** Container name -> short container id, from the same `docker ps` output. */
export function containerIdsByName(psOutput: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of psOutput.split("\n")) {
    const f = line.split("\t");
    if (f[0] && f[4]?.trim()) out.set(f[0], f[4].trim().slice(0, 12));
  }
  return out;
}

/** Add the image each container runs, from a container id -> image id lookup. */
export function withImageIds(
  groups: Record<string, DiscoveredContainer[]>,
  ids: Map<string, string>,
  imageOf: (containerId: string) => string | undefined,
): Record<string, DiscoveredContainer[]> {
  const out: Record<string, DiscoveredContainer[]> = {};
  for (const [u, list] of Object.entries(groups)) {
    out[u] = list.map((c) => {
      const id = ids.get(c.name);
      const imageId = id ? imageOf(id) : undefined;
      return imageId ? { ...c, imageId } : c;
    });
  }
  return out;
}

/**
 * Containers a hook should run in. "" → the primary container; otherwise an
 * exact container name of this resource, else every container of this resource
 * whose compose service matches. Nothing matching → [] (the caller skips the
 * hook rather than running it somewhere else).
 */
export function matchHookTargets(target: string, containers: DiscoveredContainer[], primary?: string): string[] {
  if (!target) return primary ? [primary] : [];
  if (containers.some((c) => c.name === target)) return [target];
  return containers.filter((c) => c.service === target).map((c) => c.name);
}

/** Default time limit for one hook command. */
export const DEFAULT_HOOK_TIMEOUT_SEC = 300;
