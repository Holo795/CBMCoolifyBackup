import { normalizePrivateKey, type ResolvedDestination } from "@cbm/shared";

/**
 * Editing a destination (M-01): its credentials and address, never where the
 * data is (type, engine, S3 bucket and prefix, base path) - existing backups
 * must stay where their records say. A secret left empty keeps the stored one.
 */
export type DestinationEdit = Record<string, string | undefined>;

/** What the edit form shows of a destination: everything but the secrets. */
export function editableFields(d: ResolvedDestination): Record<string, string | number | boolean | undefined> {
  if (d.type === "ssh") {
    return {
      type: "ssh",
      host: d.host,
      port: d.port,
      username: d.username,
      basePath: d.basePath,
      hasPassword: !!d.password,
      hasPrivateKey: !!d.privateKey,
      jumpHost: d.jumpHost,
      jumpPort: d.jumpPort,
      jumpUsername: d.jumpUsername,
      hasJumpPassword: !!d.jumpPassword,
      hasJumpPrivateKey: !!d.jumpPrivateKey,
    };
  }
  if (d.type === "s3") {
    return {
      type: "s3",
      bucket: d.bucket,
      prefix: d.prefix,
      region: d.region,
      endpoint: d.endpoint,
      accessKeyId: d.accessKeyId,
      forcePathStyle: d.forcePathStyle,
    };
  }
  return { type: "local", basePath: d.basePath };
}

/** The new config from the current one and the form (secrets: empty = keep, `clear*` = remove). */
export function mergeDestinationConfig(cur: ResolvedDestination, f: DestinationEdit): ResolvedDestination {
  const v = (k: string) => (f[k] ?? "").trim();
  if (cur.type === "ssh") {
    const jumpHost = v("jumpHost");
    const next = {
      ...cur,
      host: v("host") || cur.host,
      port: Number(v("port") || cur.port),
      username: v("username") || cur.username,
      password: f.clearPassword === "on" ? undefined : v("password") ? (f.password as string) : cur.password,
      privateKey:
        f.clearPrivateKey === "on" ? undefined : v("privateKey") ? normalizePrivateKey(f.privateKey) : cur.privateKey,
    };
    if (!jumpHost) {
      const { jumpHost: _h, jumpUsername: _u, jumpPassword: _p, jumpPrivateKey: _k, ...rest } = next;
      return { ...rest, jumpPort: 22 };
    }
    return {
      ...next,
      jumpHost,
      jumpPort: Number(v("jumpPort") || cur.jumpPort || 22),
      jumpUsername: v("jumpUsername") || undefined,
      jumpPassword: v("jumpPassword") ? (f.jumpPassword as string) : cur.jumpPassword,
      jumpPrivateKey: v("jumpPrivateKey") ? normalizePrivateKey(f.jumpPrivateKey) : cur.jumpPrivateKey,
    };
  }
  if (cur.type === "s3") {
    return {
      ...cur,
      region: v("region") || cur.region,
      endpoint: v("endpoint") || undefined,
      accessKeyId: v("accessKeyId") || cur.accessKeyId,
      secretAccessKey: v("secretAccessKey") ? (f.secretAccessKey as string) : cur.secretAccessKey,
      forcePathStyle: f.forcePathStyle === "on",
    };
  }
  return cur;
}

/** Why the merged config can't be saved (a dictionary key), or null. */
export function destinationEditProblem(d: ResolvedDestination): string | null {
  if (d.type === "ssh") {
    if (!d.host || !d.username || !Number.isInteger(d.port) || d.port < 1 || d.port > 65535) return "messages.destinationEditIncomplete";
    if (!d.password && !d.privateKey) return "messages.destinationEditNoAuth";
  }
  if (d.type === "s3" && (!d.accessKeyId || !d.secretAccessKey)) return "messages.destinationEditIncomplete";
  return null;
}
