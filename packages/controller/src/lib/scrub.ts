/**
 * A queued AgentJob's payload carries everything the agent needs - decrypted
 * destination credentials, AES keys, restic passwords, DB credentials. Once the
 * job is finished nothing reads it again, so it is reduced to its non-secret
 * top-level scalars (ids, type, flags) instead of being kept forever (and copied
 * into every metadata self-backup).
 */
const SECRET_KEYS = new Set([
  "decryptionKey",
  "sourceEncryptionKey",
  "targetEncryptionKey",
  "resticPassword",
  "password",
  "envEnc",
]);

/** Non-secret lists kept as they are. */
const KEPT_LISTS = new Set(["snapshotIds"]);

export function scrubPayload(payload: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { scrubbed: true };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return out;
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k)) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = v;
    // Lists of ids a late result still needs (a prune's snapshots).
    else if (KEPT_LISTS.has(k) && Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v;
    // A verify's resources per tag: ids only.
    else if (
      k === "usageResources" &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.values(v).every((l) => Array.isArray(l) && l.every((x) => typeof x === "string"))
    )
      out[k] = v;
  }
  return out;
}
